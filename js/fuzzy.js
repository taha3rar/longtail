// Answer matching, run when the player presses Enter (there is no live
// dropdown — that would give answers away). It forgives typos, accents,
// plurals, word order and sound-alike spellings, but never completes a
// half-typed word: "W" or "wolv" will not turn into "Wolverine".
(function (root) {
  const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'de', 'la', 'le', 'el']);

  function singular(t) {
    if (t.length <= 3) return t;
    if (/ies$/.test(t)) return t.slice(0, -3) + 'y';
    if (/(ch|sh|x|ss|z)es$/.test(t)) return t.slice(0, -2);
    if (/[^su]s$/.test(t)) return t.slice(0, -1);
    return t;
  }

  function normalize(s) {
    return s
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/œ/g, 'oe')
      .replace(/&/g, ' and ')
      .replace(/['’`.]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Rough phonetic skeleton so "chiwawa" ~ "chihuahua", "nietzche" ~ "nietzsche".
  function skeleton(s) {
    return s
      .replace(/^(kn|wr|ps)/, (m) => m[1]).replace(/[hg]u(?=[aeio])/g, 'w').replace(/tch/g, 'ch').replace(/sch/g, 'sh').replace(/dg/g, 'j')
      .replace(/ph/g, 'f').replace(/ck|q/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k')
      .replace(/[zx]/g, 's').replace(/y/g, 'i').replace(/[wv]/g, 'f').replace(/h/g, '')
      .replace(/([a-z])\1+/g, '$1')
      .replace(/(?!^)[aeiou]+/g, '*'); // keep where the vowels are, not which ones
  }

  function prep(s) {
    const all = normalize(s).split(' ').filter(Boolean).map(singular);
    const tokens = all.filter((t) => !STOP.has(t));
    const toks = tokens.length ? tokens : all;
    const compact = toks.join('');
    return { raw: s, tokens: toks, compact, skel: skeleton(compact) };
  }

  // Damerau-Levenshtein (optimal string alignment) with an early exit.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const m = a.length, n = b.length;
    let prev2 = null, prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      let rowMin = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      [prev2, prev, cur] = [prev, cur, prev2 || new Array(n + 1)];
    }
    return prev[n];
  }

  // Typos allowed for a word of this length. Short words must be exact.
  const allowedEdits = (len) => (len <= 4 ? 0 : len <= 7 ? 1 : len <= 11 ? 2 : 3);

  // How well one typed word matches one answer word: 1 exact, <1 typo, 0 no.
  // Deliberately no prefix matching.
  function wordMatch(q, t) {
    if (q === t) return 1;
    if (q.length < 4 || q[0] !== t[0]) return 0; // real typos almost never change the first letter
    const max = allowedEdits(Math.max(q.length, t.length));
    const d = editDistance(q, t, max);
    if (d <= max) return 0.95 - 0.06 * d;
    if (q.length >= 6 && skeleton(q) === skeleton(t)) return 0.85;
    return 0;
  }

  // Index a pool once; each item may have many names (label + aliases).
  function buildIndex(items) {
    const entries = [];
    items.forEach((item, idx) => {
      const seen = new Set();
      for (const name of item.names) {
        const p = prep(name);
        if (!p.compact || seen.has(p.compact)) continue;
        seen.add(p.compact);
        entries.push({ idx, name, p });
      }
    });
    // Words shared by lots of answers ("cat" in "Persian cat") are generic and
    // optional: "persian" alone is enough.
    // (counted per answer, not per alias, so "bush" isn't generic among presidents)
    const df = new Map();
    for (const e of entries) {
      for (const t of new Set(e.p.tokens)) {
        if (!df.has(t)) df.set(t, new Set());
        df.get(t).add(e.idx);
      }
    }
    const generic = new Set([...df].filter(([, s]) => s.size >= Math.max(4, items.length * 0.03)).map(([t]) => t));
    const byCompact = new Map();
    const byCore = new Map();
    for (const e of entries) {
      if (!byCompact.has(e.p.compact)) byCompact.set(e.p.compact, e);
      e.core = e.p.tokens.filter((t) => !generic.has(t));
      if (e.core.length && e.core.length < e.p.tokens.length) {
        const k = e.core.join('');
        if (!byCore.has(k)) byCore.set(k, new Map());
        byCore.get(k).set(e.idx, e);
      }
    }
    return { items, entries, byCompact, byCore, generic };
  }

  // How close is the typed text to one answer name? 0 = not a match.
  function closeness(q, e) {
    const n = e.p;
    let best = 0;
    // Whole-name typo ("rotweiler", "newyork"). When both sides have the same
    // number of words, judge word by word instead so typos can't pile up in one word.
    if (q.compact.length >= 4 && q.compact[0] === n.compact[0] && (q.tokens.length !== n.tokens.length || q.tokens.length === 1)) {
      const max = allowedEdits(Math.max(q.compact.length, n.compact.length));
      const d = editDistance(q.compact, n.compact, max);
      if (d <= max) best = 0.95 - 0.06 * d;
      else if (q.compact.length >= 6 && q.skel === n.skel) best = 0.86;
    }
    // Word by word, any order: every typed word must match a whole answer word,
    // and every important answer word must be covered.
    const used = new Set();
    let sum = 0;
    for (const qt of q.tokens) {
      let b = 0, bj = -1;
      n.tokens.forEach((t, j) => {
        if (used.has(j)) return;
        const s = wordMatch(qt, t);
        if (s > b) { b = s; bj = j; }
      });
      if (!b) return best;
      used.add(bj);
      sum += b;
    }
    // Generic words may be left out, but not when the typed text is tiny ("dog" ≠ "dog mustard").
    const covered = n.tokens.every((t, j) => used.has(j) || (!e.core.includes(t) && q.compact.length >= 4));
    // A lone surname covers a person ("lincoln", "eisenhauer").
    const last = n.tokens.length - 1;
    // (a misspelt surname only counts if it's long enough to be unambiguous)
    const surname = q.tokens.length === 1 && used.has(last) && n.tokens.length <= 4 && n.tokens[last].length >= 4 &&
      (q.tokens[0] === n.tokens[last] || q.tokens[0].length >= 5);
    if (covered || surname) best = Math.max(best, (sum / q.tokens.length) * 0.97);
    return best;
  }

  // Interpret a submitted answer. Returns one of:
  //   { item, name, exact: true }   typed an accepted name exactly
  //   { item, name }                one close match ("did you mean …?")
  //   { choices: [{ item, name }] } several equally close matches
  //   {}                            nothing close
  function check(index, text) {
    const q = prep(text);
    if (!q.compact) return {};
    const hit = (e, exact) => ({ item: index.items[e.idx], name: e.name, exact });

    const exact = index.byCompact.get(q.compact);
    // A lone generic word ("dog" for dog breeds) only counts if it exactly names
    // the most famous answer containing it ("persian" → Persian cat).
    if (q.tokens.length === 1 && index.generic.has(q.tokens[0])) {
      const top = index.entries.filter((e) => e.p.tokens.includes(q.tokens[0])).reduce((a, b) => (b.idx < a.idx ? b : a));
      return exact && exact.idx === top.idx ? hit(exact, true) : {};
    }
    if (exact) {
      return hit(exact, true);
    }
    const core = index.byCore.get(q.compact);
    if (core && core.size === 1 && q.compact.length >= 4) {
      // "bernese" fits Bernese hound and Bernese Mountain Dog: ask which.
      const also = new Map();
      for (const e of index.entries) {
        if (q.tokens.every((t) => e.p.tokens.includes(t)) && !also.has(e.idx)) also.set(e.idx, e);
      }
      if (also.size <= 1) return hit([...core.values()][0], true);
      return { choices: [...also.values()].sort((a, b) => a.p.tokens.length - b.p.tokens.length).slice(0, 4).map((e) => hit(e, false)) };
    }

    const best = new Map();
    for (const e of index.entries) {
      const s = closeness(q, e);
      if (s < 0.8) continue;
      const cur = best.get(e.idx);
      if (!cur || s > cur.s) best.set(e.idx, { e, s });
    }
    const ranked = [...best.values()].sort((a, b) => b.s - a.s);
    if (!ranked.length) return {};
    // Exact surname match of exactly one person counts as typing it.
    const sure = ranked.filter((r) => r.s >= 0.97 * 0.999);
    if (sure.length === 1 && ranked[0] === sure[0]) return hit(sure[0].e, true);
    if (ranked.length === 1 || ranked[0].s - ranked[1].s >= 0.04) return hit(ranked[0].e, false);
    return { choices: ranked.filter((r) => r.s >= ranked[0].s - 0.04).slice(0, 4).map((r) => hit(r.e, false)) };
  }

  root.Fuzzy = { normalize, prep, buildIndex, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Fuzzy;
})(typeof window !== 'undefined' ? window : globalThis);
