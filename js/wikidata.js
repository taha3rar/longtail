// Fetches the live answer pool for a question from Wikidata and ranks it.
// Popularity = number of Wikipedia language editions with an article on the
// item ("sitelinks"), which tracks closely with how well-known something is.
(function (root) {
  const ENDPOINT = 'https://query.wikidata.org/sparql';
  const LIMIT = 2500;

  function buildQuery(question) {
    const min = question.m || 1;
    // Keep this flat: wrapping the pattern in a sub-select makes the query
    // planner start from "all English labels" and time out.
    return `SELECT ?item ?label ?sl
  (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
  (GROUP_CONCAT(DISTINCT ?common; separator="|") AS ?commons)
WHERE {
  ${question.w}
  ?item wikibase:sitelinks ?sl .
  FILTER(?sl >= ${min})
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item skos:altLabel ?alias . FILTER(LANG(?alias) = "en") }
  OPTIONAL { ?item wdt:P1843 ?common . FILTER(LANG(?common) = "en") }
} GROUP BY ?item ?label ?sl ORDER BY DESC(?sl) LIMIT ${LIMIT}`;
  }

  // Wikidata aliases include IDs, codes and junk; keep things a person might type.
  function usableName(s) {
    if (!s || s.length < 2 || s.length > 80) return false;
    if (/^Q\d+$/.test(s)) return false;
    if (/\d{4,}/.test(s) && !/[a-z]{3}/i.test(s)) return false;
    return /\p{L}/u.test(s);
  }

  function parse(json) {
    const byLabel = new Map();
    for (const b of json.results.bindings) {
      const label = b.label.value;
      if (!usableName(label)) continue;
      const sl = +b.sl.value;
      const names = new Set([label]);
      for (const key of ['commons', 'aliases']) {
        if (!b[key] || !b[key].value) continue;
        // Drop alias qualifiers: "Rome, New York" → "Rome", so it doesn't compete with "New York".
        for (const a of b[key].value.split('|')) {
          const head = key === 'aliases' ? a.split(', ')[0] : a;
          if (usableName(head)) names.add(head);
        }
      }
      // "Animals (Pink Floyd album)" should also match plain "Animals".
      for (const n of [...names]) {
        const bare = n.replace(/\s*\([^)]*\)\s*$/, '');
        if (bare !== n && usableName(bare)) names.add(bare);
      }
      // Taxa are labelled with their scientific name; show the common name instead.
      let display = label;
      if (b.commons && b.commons.value) {
        const c = b.commons.value.split('|').find(usableName);
        if (c) display = c;
      }
      if (display === display.toLowerCase()) display = display[0].toUpperCase() + display.slice(1);
      const k = display.toLowerCase();
      const prev = byLabel.get(k);
      if (prev) { // duplicate labels: merge into the more famous one
        names.forEach((n) => prev.names.add(n));
        prev.sl = Math.max(prev.sl, sl);
      } else {
        byLabel.set(k, { id: b.item.value.split('/').pop(), display, sl, names });
      }
    }
    return [...byLabel.values()];
  }

  // Combine one or more part results into a single pool ranked by fame.
  function merge(lists) {
    const byKey = new Map();
    for (const list of lists) {
      for (const it of list) {
        const k = it.display.toLowerCase();
        const prev = byKey.get(k);
        if (prev) { it.names.forEach((n) => prev.names.add(n)); prev.sl = Math.max(prev.sl, it.sl); }
        else byKey.set(k, { ...it, names: new Set(it.names) });
      }
    }
    const items = [...byKey.values()].sort((a, b) => b.sl - a.sl);
    items.forEach((it, i) => { it.rank = i; it.names = [...it.names]; });
    return items;
  }

  async function fetchPart(part, fetchImpl, signal) {
    const f = fetchImpl || root.fetch.bind(root);
    const url = ENDPOINT + '?format=json&query=' + encodeURIComponent(buildQuery(part));
    const res = await f(url, { headers: { Accept: 'application/sparql-results+json' }, signal });
    if (!res.ok) throw new Error('Wikidata HTTP ' + res.status);
    return parse(await res.json());
  }

  // A source is either one pattern { w, m } or several { parts: [{ w, m }, ...] }
  // fetched separately (big classes time out as one query) and merged.
  // `wrap` lets the caller throttle each request.
  async function fetchPool(source, fetchImpl, signal, wrap = (fn) => fn()) {
    const parts = source.parts || [source];
    const results = await Promise.allSettled(parts.map((p) => wrap(() => fetchPart(p, fetchImpl, signal))));
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    // A merged pool survives one slow part; a single-part pool can't.
    if (ok.length < Math.ceil(parts.length * 0.6)) throw results.find((r) => r.status === 'rejected').reason;
    const items = merge(ok);
    items.partial = ok.length < parts.length; // don't cache incomplete pools for long
    return items;
  }

  const api = { buildQuery, parse, merge, fetchPart, fetchPool };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Wikidata = api;
})(typeof window !== 'undefined' ? window : globalThis);
