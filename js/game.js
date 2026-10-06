(function () {
  const ROUNDS = 7;
  const ANSWER_MS = 25000;
  const ENDLESS_LIVES = 3;
  const MIN_POOL = 25;
  const CACHE_DAYS = 7;
  const TEMPLATE_SHARE = 0.35; // share of rounds that are letter challenges in mixed modes

  const TIERS = {
    obvious: { name: 'Obvious', score: 10, emoji: '🫧', cls: 't-obvious', hype: 'Obvious…', big: false },
    clever: { name: 'Too Clever', score: 15, emoji: '🤡', cls: 't-clever', hype: 'Too clever!', big: false },
    common: { name: 'Common', score: 30, emoji: '🐟', cls: 't-common', hype: 'Not bad', big: false },
    rare: { name: 'Rare', score: 60, emoji: '🦑', cls: 't-rare', hype: 'RARE!', big: true },
    deep: { name: 'Deep Cut', score: 85, emoji: '🏮', cls: 't-deep', hype: 'DEEP CUT!!', big: true },
    gem: { name: 'The Gem', score: 100, emoji: '🌟', cls: 't-gem', hype: 'THE GEM!!!', big: true },
  };
  const MISS_EMOJI = '⬛';
  const BANDS = [
    { min: 450, text: '🌟 Gem hunter. Absurdly deep.' },
    { min: 351, text: '🏮 Deep cut. Way out in the tail.' },
    { min: 251, text: '🦑 Rare. Well past the obvious.' },
    { min: 151, text: '🐟 Common. Swimming with the crowd.' },
    { min: 0, text: '🫧 Obvious. Plenty of tail left out there.' },
  ];
  const CATEGORY_ICONS = { Home: '🏠', Animals: '🐾', Food: '🍕', Places: '🌍', Screen: '🎬', Fun: '🎲', Sport: '⚽', People: '🧑', Stuff: '🧸', Letters: '🔤' };

  // ── utilities ──
  const $ = (id) => document.getElementById(id);
  const slug = (s) => Fuzzy.normalize(s).replace(/ /g, '-');
  function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const { sfx } = FX;

  // ── questions: fixed prompts + letter challenges ──
  const sourceOf = (q) => (q.pool ? { id: 'pool:' + q.pool, src: POOLS[q.pool] } : { id: slug(q.q), src: q });
  const FIXED = QUESTIONS.map((q) => ({ type: 'fixed', q, c: q.c, ...sourceOf(q) }));
  const LETTERS = TEMPLATES.map((t) => ({ type: 'letters', t, c: t.c, id: 'pool:' + t.pool, src: POOLS[t.pool] }));

  // The letters a name is judged on: "The Bahamas" → "bahamas".
  const lettersOf = (name) => Fuzzy.normalize(name).replace(/^the /, '').replace(/[^a-z]/g, '');
  const PAIRS = ['oo', 'ee', 'ch', 'sh', 'th', 'ou', 'ai', 'ia', 'an', 'or', 'er', 'll', 'ss', 'tt', 'ar', 'st', 'ng'];
  const RARE_LETTERS = 'zxqjkvwyb'.split('');
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

  // Every possible rule for a template kind, as { test, text, key }.
  function rulesFor(kind, noun) {
    const up = (s) => s.toUpperCase();
    switch (kind) {
      case 'start': return ALPHABET.map((L) => ({ key: 's' + L, test: (w) => w[0] === L, text: `starting with <span class="hl">${up(L)}</span>`, fail: `doesn't start with ${up(L)}` }));
      case 'end': return ALPHABET.map((L) => ({ key: 'e' + L, test: (w) => w[w.length - 1] === L, text: `ending in <span class="hl">${up(L)}</span>`, fail: `doesn't end in ${up(L)}` }));
      case 'has': return [
        ...RARE_LETTERS.map((L) => ({ key: 'h' + L, test: (w) => w.includes(L), text: `with the letter <span class="hl">${up(L)}</span> in it`, fail: `has no ${up(L)}` })),
        ...PAIRS.map((P) => ({ key: 'h' + P, test: (w) => w.includes(P), text: `containing <span class="hl">"${up(P)}"</span>`, fail: `doesn't contain "${up(P)}"` })),
      ];
      case 'len': return [3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ key: 'l' + n, test: (w) => w.length === n, text: `with exactly <span class="hl">${n} letters</span>`, fail: `doesn't have ${n} letters` }));
      case 'double': return [{ key: 'dd', test: (w) => /(.)\1/.test(w), text: `with a <span class="hl">double letter</span> (like "ee" or "ll")`, fail: 'has no double letter' }];
      default: return [];
    }
  }

  // Narrow a pool to the names that satisfy a rule; fame ranks are recomputed.
  function applyRule(items, rule) {
    const out = [];
    for (const it of items) {
      const names = it.names.filter((n) => rule.test(lettersOf(n)));
      if (names.length) out.push({ ...it, names, display: names.includes(it.display) ? it.display : names[0] });
    }
    out.forEach((it, i) => { it.rank = i; });
    return out;
  }

  // Pick a rule with enough valid answers for this pool.
  function makeLetterRound(entry, pool, rand) {
    const n = pool.items.length;
    const need = Math.max(8, Math.min(40, Math.round(n * 0.03)));
    for (const kind of shuffle(entry.t.kinds, rand)) {
      const counts = new Map();
      const rules = rulesFor(kind).filter((r) => {
        let c = 0;
        for (const it of pool.items) if (it.names.some((nm) => r.test(lettersOf(nm)))) c++;
        counts.set(r.key, c);
        return c >= need;
      });
      if (!rules.length) continue;
      const rule = pick(rules, rand);
      const items = applyRule(pool.items, rule);
      return {
        key: entry.id + ':' + rule.key,
        html: `Name ${esc(entry.t.noun)} ${rule.text}`,
        rule,
        pool: finishPool(items),
        full: pool,
      };
    }
    return null;
  }

  // ── pool loading: memory → localStorage → Wikidata ──
  const memory = new Map();
  const inflight = new Map();
  let active = 0;
  const waiters = [];
  // At most 4 Wikidata requests at once; game-critical requests jump the queue.
  function throttle(fn, urgent) {
    return async () => {
      if (active >= 4) await new Promise((r) => (urgent ? waiters.unshift(r) : waiters.push(r)));
      active++;
      try { return await fn(); } finally { active--; const w = waiters.shift(); if (w) w(); }
    };
  }

  function cacheRead(id) {
    const c = store.get('lt:pool:' + id);
    if (!c || Date.now() - c.t > CACHE_DAYS * 864e5) return null;
    return c.items.map(([qid, display, sl, names], rank) => ({ id: qid, display, sl, names, rank }));
  }
  function cacheWrite(id, items) {
    const entry = { t: Date.now(), items: items.map((i) => [i.id, i.display, i.sl, i.names]) };
    const keys = store.get('lt:poolkeys', []).filter((k) => k !== id);
    keys.push(id);
    while (keys.length) {
      if (store.set('lt:pool:' + id, entry)) break;
      store.del('lt:pool:' + keys.shift()); // storage full: evict oldest
    }
    while (keys.length > 40) store.del('lt:pool:' + keys.shift());
    store.set('lt:poolkeys', keys);
  }

  function finishPool(items) {
    const n = items.length;
    const obvious = Math.min(8, Math.max(3, Math.round(n * 0.012)));
    const common = Math.max(obvious + 4, Math.round(n * 0.07));
    const rare = Math.max(common + 6, Math.round(n * 0.25));
    return { items, index: Fuzzy.buildIndex(items), cut: { obvious, common, rare } };
  }

  const isReady = (entry) => memory.has(entry.id) || !!cacheRead(entry.id);

  function loadPool(entry, { urgent = false, onProgress } = {}) {
    if (memory.has(entry.id)) return Promise.resolve(memory.get(entry.id));
    if (inflight.has(entry.id)) return inflight.get(entry.id);
    const p = (async () => {
      let items = cacheRead(entry.id);
      if (!items) {
        const total = (entry.src.parts || [entry.src]).length;
        let done = 0;
        const wrap = (fn) => throttle(async () => {
          try { return await fn(); } finally { done++; if (onProgress) onProgress(done, total); }
        }, urgent)();
        items = await Wikidata.fetchPool(entry.src, null, AbortSignal.timeout(45000), wrap);
        if (items.length >= MIN_POOL && !items.partial) cacheWrite(entry.id, items);
      }
      if (items.length < MIN_POOL) throw new Error('pool too small');
      const pool = finishPool(items);
      memory.set(entry.id, pool);
      return pool;
    })();
    inflight.set(entry.id, p);
    p.catch(() => {}).finally(() => inflight.delete(entry.id));
    return p;
  }

  function baseTier(pool, item) {
    const { cut } = pool, r = item.rank;
    return r < cut.obvious ? 'obvious' : r < cut.common ? 'common' : r < cut.rare ? 'rare' : 'deep';
  }
  // The gem: one item from the better-known half of the deep tail.
  function pickGem(pool, rand) {
    const n = pool.items.length, start = Math.min(pool.cut.rare, n - 1);
    const end = Math.max(start + 1, start + Math.floor((n - start) * 0.5));
    return pool.items[Math.min(n - 1, start + Math.floor(rand() * (end - start)))];
  }

  // ── screens ──
  let showing = 'home';
  function show(id) {
    if (id === showing) return;
    const prev = $(showing);
    const next = $(id);
    prev.classList.remove('active');
    prev.classList.add('leaving');
    setTimeout(() => prev.classList.remove('leaving'), 180);
    next.classList.remove('active'); void next.offsetWidth;
    setTimeout(() => next.classList.add('active'), 120);
    showing = id;
    document.body.classList.remove('danger');
  }

  // ── game state ──
  let game = null;
  let current = null;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers.forEach(clearInterval); timers = []; };

  // Daily and Seeded games must play out identically for everyone with the same seed.
  const isShared = (mode) => mode === 'daily' || mode === 'seeded';

  function buildQueue(mode, category, rand) {
    const recent = isShared(mode) ? [] : store.get('lt:recent', []);
    let fixed = FIXED, letters = LETTERS;
    if (category === 'Letters') fixed = [];
    else if (category) { fixed = FIXED.filter((e) => e.c === category); letters = LETTERS.filter((e) => e.c === category); }
    const fresh = fixed.filter((e) => !recent.includes(e.id));
    const fixedOrder = shuffle(fresh.length >= ROUNDS ? fresh : fixed, rand);
    const queue = [];
    let fi = 0;
    for (let i = 0; i < 400; i++) {
      const wantLetters = letters.length && (!fixedOrder.length || rand() < (category === 'Letters' ? 1 : TEMPLATE_SHARE));
      if (wantLetters) queue.push(pick(letters, rand));
      else if (fi < fixedOrder.length) queue.push(fixedOrder[fi++]);
      else break;
    }
    return queue;
  }

  function startGame(mode, category, seedText) {
    sfx.blip(2);
    const seed = mode === 'daily' ? hashStr('daily:' + today())
      : mode === 'seeded' ? hashStr('seed:' + seedText)
      : (Math.random() * 2 ** 32) >>> 0;
    const rand = rng(seed);
    game = {
      mode, category, rand, seedText,
      queue: buildQueue(mode, category, rand),
      rounds: [], lives: ENDLESS_LIVES, total: 0,
      max: mode === 'endless' ? Infinity : ROUNDS,
      usedKeys: new Set(),
    };
    nextRound();
  }

  // Next playable entry. Prefer one whose answers are already loaded so the
  // player isn't kept waiting (except in Daily/Seeded, where order is fixed).
  async function takeQuestion() {
    if (!isShared(game.mode)) {
      const readyAt = game.queue.slice(0, 5).findIndex(isReady);
      if (readyAt > 0) game.queue.unshift(game.queue.splice(readyAt, 1)[0]);
    }
    let failures = 0;
    while (game.queue.length && failures < 4) {
      const entry = game.queue.shift();
      try {
        const pool = await loadPool(entry, {
          urgent: true,
          onProgress: (d, t) => { if (t > 1) $('loading-sub').textContent = `${d} / ${t} lists`; },
        });
        if (entry.type === 'fixed') {
          if (game.usedKeys.has(entry.id)) continue;
          return { key: entry.id, html: esc(entry.q.q), pool, entry };
        }
        const made = makeLetterRound(entry, pool, game.rand);
        if (made && !game.usedKeys.has(made.key)) return { ...made, entry };
      } catch (e) {
        failures++;
        console.warn('skipping', entry.id, e.message);
      }
    }
    return null;
  }
  // Warm the next couple of rounds in the background.
  function prefetch() { game.queue.slice(0, 3).forEach((e) => loadPool(e).catch(() => {})); }

  async function nextRound() {
    clearTimers();
    const done = game.mode === 'endless' ? game.lives <= 0 : game.rounds.length >= game.max;
    if (done) return finish();
    $('loading-msg').textContent = pick(['Diving in…', 'Gathering answers…', 'Sounding the depths…', 'Fetching the long tail…'], Math.random);
    $('loading-sub').textContent = '';
    const thisGame = game;
    const slow = setTimeout(() => { if (game === thisGame) show('loading'); }, 150);
    const next = await takeQuestion();
    clearTimeout(slow);
    if (game !== thisGame) return;
    if (!next) {
      show('loading');
      $('loading-msg').innerHTML = "Couldn't reach Wikidata (it may be busy).<br><br>" +
        '<button class="primary" id="retry-btn">Try again</button> ' +
        (game.rounds.length ? '<button id="finish-btn">See results</button>' : '<button id="back-btn">Home</button>');
      $('retry-btn').onclick = () => { if (!game.queue.length) game.queue = buildQueue(game.mode, game.category, game.rand); nextRound(); };
      if ($('finish-btn')) $('finish-btn').onclick = finish;
      if ($('back-btn')) $('back-btn').onclick = goHome;
      return;
    }
    prefetch();
    game.usedKeys.add(next.key);
    const round = { ...next, cat: next.entry.c, gem: pickGem(next.pool, game.rand), result: null };
    game.rounds.push(round);
    const recent = store.get('lt:recent', []).filter((k) => k !== next.key);
    recent.push(next.key);
    store.set('lt:recent', recent.slice(-150));
    playRound(round);
  }

  // ── a round ──
  const RING = 2 * Math.PI * 52;

  function renderProgress() {
    const el = $('progress');
    if (game.mode === 'endless') {
      el.innerHTML = Array.from({ length: ENDLESS_LIVES }, (_, i) => `<span class="heart${i >= game.lives ? ' lost' : ''}">❤️</span>`).join('') +
        `<span class="count mono">#${game.rounds.length}</span>`;
      return;
    }
    el.innerHTML = Array.from({ length: game.max }, (_, i) => {
      const r = game.rounds[i];
      if (r && r.result) {
        const color = r.result.tier ? `var(--${TIERS[r.result.tier].cls})` : 'var(--line)';
        return `<span class="dot done" style="background:${color}"></span>`;
      }
      return `<span class="dot${i === game.rounds.length - 1 ? ' now' : ''}"></span>`;
    }).join('');
  }

  function setTimer(ms, state) {
    const t = $('timer');
    t.className = 'timer' + (state ? ' ' + state : '');
    $('timer-ring').style.strokeDashoffset = String(RING * (1 - ms / ANSWER_MS));
  }
  function beat() { const t = $('timer'); t.classList.remove('beat'); void t.offsetWidth; t.classList.add('beat'); }

  function playRound(round) {
    current = { round, phase: 'preview', endsAt: 0, pending: null, choices: null, lastSec: null };
    renderProgress();
    $('round-score').textContent = game.total;
    $('round-cat').textContent = `${CATEGORY_ICONS[round.cat] || ''} ${round.cat}${round.rule ? ' · letters' : ''}`;
    const prompt = $('prompt');
    prompt.innerHTML = round.html;
    prompt.classList.remove('in'); void prompt.offsetWidth; prompt.classList.add('in');
    const input = $('answer');
    input.value = '';
    input.disabled = true;
    $('input-wrap').className = 'input-wrap locked';
    clearAsk();
    setFeedback('');
    show('round');

    // 3-2-1-GO
    let n = 3;
    const count = () => {
      if (!current || current.round !== round) return;
      if (n > 0) {
        $('timer-num').textContent = n;
        setTimer(ANSWER_MS, 'preview');
        beat();
        sfx.count();
        n--;
        later(count, 800);
      } else {
        beginAnswering();
      }
    };
    later(count, 350);
  }

  function beginAnswering() {
    current.phase = 'answering';
    current.endsAt = Date.now() + ANSWER_MS;
    sfx.go();
    $('timer-num').textContent = ANSWER_MS / 1000;
    setTimer(ANSWER_MS, '');
    beat();
    const input = $('answer');
    input.disabled = false;
    $('input-wrap').className = 'input-wrap';
    input.focus();
    const tick = () => {
      if (!current || current.phase !== 'answering') return;
      const ms = Math.max(0, current.endsAt - Date.now());
      const sec = Math.ceil(ms / 1000);
      const state = ms <= 5000 ? 'hot' : ms <= 10000 ? 'warn' : '';
      setTimer(ms, state);
      if (sec !== current.lastSec) {
        current.lastSec = sec;
        $('timer-num').textContent = sec;
        if (sec <= 5 && sec > 0) { beat(); sfx.tickHot(); }
        else if (sec <= 10) { beat(); sfx.tick(); }
      }
      document.body.classList.toggle('danger', ms <= 5000 && ms > 0);
      if (ms <= 0) return timeUp();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function timeUp() {
    // An answer waiting for confirmation still counts.
    if (current.pending) return lockIn(current.pending, true);
    sfx.timeUp();
    endRound(null);
  }

  function setFeedback(text, bad) {
    const line = $('feedback-line');
    line.className = 'mono' + (bad ? ' bad' : '');
    line.textContent = text;
  }

  function clearAsk() {
    if (current) { current.pending = null; current.choices = null; }
    $('confirm').innerHTML = '';
    $('input-wrap').classList.remove('asking', 'bad');
  }

  // Show "Lock in X?" — Enter (or the button) confirms.
  function ask(hit) {
    current.pending = hit;
    current.choices = null;
    const via = Fuzzy.normalize(hit.name) !== Fuzzy.normalize(hit.item.display) ? ` <span class="via">(as “${esc(hit.name)}”)</span>` : '';
    const q = hit.exact ? 'Lock in' : 'Did you mean';
    $('confirm').innerHTML = `<div class="ask"><span>${q} <b>${esc(hit.item.display)}</b>${via}?</span>` +
      `<button type="button" class="lock-btn" id="lock-btn">Lock in ⏎</button></div>`;
    $('lock-btn').onclick = () => lockIn(hit);
    $('input-wrap').classList.add('asking');
    sfx.ask();
  }

  function askChoice(choices) {
    current.pending = null;
    current.choices = choices;
    $('confirm').innerHTML = `<div class="dim">Which one?</div><div class="choices">` +
      choices.map((c, i) => `<button type="button" data-i="${i}" style="animation-delay:${i * 50}ms"><kbd>${i + 1}</kbd>${esc(c.item.display)}</button>`).join('') + '</div>';
    $('confirm').querySelectorAll('button[data-i]').forEach((b) => { b.onclick = () => lockIn(choices[+b.dataset.i]); });
    sfx.ask();
  }

  function reject(msg) {
    setFeedback(msg, true);
    const wrap = $('input-wrap');
    wrap.classList.add('bad');
    FX.shake(wrap);
    sfx.wrong();
    $('answer').select();
  }

  function submit() {
    if (!current || current.phase !== 'answering') return;
    if (current.pending) return lockIn(current.pending);
    const text = $('answer').value.trim();
    if (!text) return;
    const { round } = current;
    const r = Fuzzy.check(round.pool.index, text);
    setFeedback('');
    if (r.item) return ask(r);
    if (r.choices) return askChoice(r.choices);
    // Letter rounds: say why a real answer doesn't count.
    if (round.full) {
      const any = Fuzzy.check(round.full.index, text);
      if (any.item) return reject(`${any.item.display} ${round.rule.fail}`);
    }
    reject(`"${text}" isn't on the list`);
  }

  function lockIn(hit, auto) {
    if (!current || current.phase !== 'answering') return;
    sfx.lock();
    $('answer').value = hit.item.display;
    endRound(hit, auto);
  }

  function endRound(hit, auto) {
    current.phase = 'done';
    document.body.classList.remove('danger');
    $('answer').disabled = true;
    const { round } = current;
    let tier = null;
    const item = hit && hit.item;
    if (item) {
      tier = item.id === round.gem.id ? 'gem' : baseTier(round.pool, item);
      const usedKey = 'lt:used:' + round.key;
      const used = store.get(usedKey, []);
      // (not in Daily/Seeded: your own history mustn't change scores you compare with friends)
      if (!isShared(game.mode) && tier !== 'gem' && used.includes(item.id) && TIERS[tier].score > TIERS.clever.score) tier = 'clever';
      if (!used.includes(item.id)) { used.push(item.id); store.set(usedKey, used.slice(-60)); }
    }
    round.result = { item, name: hit && hit.name, tier, score: tier ? TIERS[tier].score : 0, auto };
    game.total += round.result.score;
    if (!item && game.mode === 'endless') game.lives--;
    later(() => showReveal(round), item ? 250 : 700);
  }

  // ── reveal ──
  let revealReadyAt = 0;
  function showReveal(round) {
    const { result, pool, gem } = round;
    const hype = $('hype');
    const badge = $('reveal-tier');
    if (result.item) {
      const t = TIERS[result.tier];
      hype.textContent = t.hype;
      hype.className = `hype ${t.big ? 'go' : 'meh'} ${result.tier === 'gem' ? 'rainbow' : t.cls}`;
      badge.className = 'tier-badge ' + t.cls;
      badge.innerHTML = `<span class="emo">${t.emoji}</span>${t.name}`;
      badge.style.display = '';
      const via = Fuzzy.normalize(result.name) !== Fuzzy.normalize(result.item.display) ? ` <span class="via">(as “${esc(result.name)}”)</span>` : '';
      $('reveal-answer').innerHTML = esc(result.item.display) + via + (result.auto ? ' <span class="via">⏱ locked at the buzzer</span>' : '');
      $('reveal-rank').textContent = `#${result.item.rank + 1} most famous of ${pool.items.length}`;
    } else {
      hype.textContent = "Time's up!";
      hype.className = 'hype meh dim';
      badge.style.display = 'none';
      $('reveal-answer').textContent = game.mode === 'endless' ? `${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left` : '';
      $('reveal-rank').textContent = '';
    }
    const pts = $('reveal-points');
    pts.className = 'points mono ' + (result.tier ? TIERS[result.tier].cls : 'dim');
    pts.textContent = '+0';
    $('reveal-obvious').textContent = pool.items.slice(0, 3).map((i) => i.display).join(', ');
    $('reveal-gem').textContent = gem.display;
    drawCurve(round);
    const last = game.mode === 'endless' ? game.lives <= 0 : game.rounds.length >= game.max;
    $('next-btn').textContent = last ? 'See results ⏎' : 'Next ⏎';
    show('reveal');
    revealReadyAt = Date.now() + 900; // don't let the lock-in Enter skip this screen

    // Hype by tier.
    later(() => {
      if (result.tier) {
        TIERS[result.tier] && sfx.tier[result.tier]();
        FX.countUp(pts, 0, result.score, 700, (v) => '+' + v);
        bumpScore();
      }
      if (result.tier === 'deep') {
        FX.confetti(120, ['#ffb547', '#ff8a3d', '#ffd88a', '#4cd98a']);
        FX.flash('rgba(255,181,71,.35)');
        FX.shake($('reveal'), 'shake-big');
      } else if (result.tier === 'gem') {
        FX.confetti(260, ['#ff5fa2', '#ffb547', '#4cd98a', '#4fc3f7', '#c98bff', '#fff']);
        FX.flash('rgba(255,95,162,.45)');
        FX.shake($('reveal'), 'shake-big');
      } else if (result.tier === 'rare') {
        FX.confetti(50, ['#4cd98a', '#4fc3f7', '#a8f0c6']);
      }
    }, 260);
    later(() => $('next-btn').focus(), 950);
  }

  function bumpScore() {
    const pill = $('round-score');
    pill.textContent = game.total;
    pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
  }

  // The long-tail curve: fame by rank, with tier zones and your answer marked.
  function drawCurve(round) {
    const { pool, result, gem } = round;
    const W = 600, H = 200, pad = 10, base = H - 24;
    const n = pool.items.length;
    const maxSl = Math.log(pool.items[0].sl + 1);
    const x = (r) => pad + (W - 2 * pad) * Math.sqrt(r / (n - 1 || 1));
    const y = (sl) => base - (base - pad - 6) * (Math.log(sl + 1) / maxSl);
    const step = Math.max(1, Math.floor(n / 240));
    let d = `M${x(0)},${base}`;
    for (let r = 0; r < n; r += step) d += ` L${x(r).toFixed(1)},${y(pool.items[r].sl).toFixed(1)}`;
    d += ` L${x(n - 1)},${y(pool.items[n - 1].sl).toFixed(1)} L${x(n - 1)},${base} Z`;
    const zones = [
      ['obvious', 0, pool.cut.obvious], ['common', pool.cut.obvious, pool.cut.common],
      ['rare', pool.cut.common, pool.cut.rare], ['deep', pool.cut.rare, n],
    ];
    let svg = `<path class="area" d="${d}"/>`;
    for (const [k, a, b] of zones) {
      if (a >= n) continue;
      const mid = (x(a) + x(Math.min(b, n - 1))) / 2;
      svg += `<line class="divider" x1="${x(a)}" x2="${x(a)}" y1="${pad}" y2="${base}"/>`;
      svg += `<text class="band-label" x="${mid}" y="${H - 6}" text-anchor="middle" style="fill:var(--${TIERS[k].cls})">${TIERS[k].name}</text>`;
    }
    const dot = (item, color, label) => {
      const cx = x(item.rank), cy = y(item.sl);
      return `<g class="marker"><circle cx="${cx}" cy="${cy}" r="7" fill="${color}" stroke="var(--bg)" stroke-width="2"/>` +
        `<text x="${Math.min(W - 60, Math.max(60, cx))}" y="${Math.max(18, cy - 14)}" text-anchor="middle" style="font:600 12px 'Space Grotesk';fill:${color}">${esc(label)}</text></g>`;
    };
    svg += dot(gem, 'var(--t-gem)', '★ gem');
    if (result.item && result.item.id !== gem.id) svg += dot(result.item, `var(--${TIERS[result.tier].cls})`, 'you');
    $('curve').innerHTML = svg;
  }

  // ── final ──
  function finish() {
    clearTimers();
    current = null;
    const played = game.rounds.filter((r) => r.result);
    const total = game.total;
    const modeName = game.mode === 'daily' ? `Daily · ${today()}` : game.mode === 'seeded' ? `Seed · ${game.seedText}` : game.mode === 'endless' ? `Endless · ${played.length} prompts` : game.category ? `Dive · ${game.category}` : 'Dive';
    $('final-mode').textContent = modeName;
    $('final-out-of').textContent = game.mode === 'endless' ? 'points' : `points out of ${game.max * 100}`;
    const perRound = game.mode === 'endless' ? (total / Math.max(1, played.length)) * ROUNDS : total;
    $('final-band').textContent = BANDS.find((b) => perRound >= b.min).text;
    const emojis = played.map((r) => (r.result.tier ? TIERS[r.result.tier].emoji : MISS_EMOJI));
    $('final-emoji').innerHTML = emojis.map((e, i) => `<span style="animation-delay:${0.25 + i * 0.12}s">${e}</span>`).join('');
    emojis.forEach((_, i) => setTimeout(() => sfx.blip(i), 250 + i * 120));
    $('final-list').innerHTML = played.map((r) => {
      const t = r.result.tier ? TIERS[r.result.tier] : null;
      const q = r.html.replace(/<[^>]+>/g, '');
      const ans = r.result.item ? `${esc(r.result.item.display)} <span class="${t.cls}">${t.emoji} ${t.name} +${t.score}</span>` : `<span class="dim">no answer</span>`;
      return `<li><span class="q">${esc(q)}</span>${ans}</li>`;
    }).join('');
    game.shareText = `Long Tail ${modeName}\n${emojis.join('')}\n${total} pts`;
    if (game.mode === 'seeded' && /^https?:$/.test(location.protocol)) game.shareText += `\nBeat me: ${seedLink(game.seedText)}`;
    if (game.mode === 'daily') {
      const best = store.get('lt:daily', {});
      best[today()] = Math.max(best[today()] || 0, total);
      store.set('lt:daily', best);
    }
    $('share-btn').textContent = '📋 Copy result';
    show('final');
    $('final-score').textContent = '0';
    setTimeout(() => FX.countUp($('final-score'), 0, total, 1200), 300);
    if (perRound >= 351) setTimeout(() => FX.confetti(perRound >= 450 ? 260 : 140, ['#ff5fa2', '#ffb547', '#4cd98a', '#4fc3f7', '#c98bff']), 1400);
  }

  function goHome() {
    clearTimers();
    game = null;
    current = null;
    renderDaily();
    show('home');
  }

  // ── wiring ──
  function renderCategories() {
    const counts = {};
    FIXED.forEach((e) => { counts[e.c] = (counts[e.c] || 0) + 1; });
    $('categories').innerHTML = Object.keys(counts).concat('Letters')
      .map((c) => `<button data-cat="${esc(c)}">${CATEGORY_ICONS[c] || ''} ${esc(c)}</button>`).join('');
  }
  function renderDaily() {
    const best = store.get('lt:daily', {})[today()];
    $('daily-desc').textContent = best != null ? `Today's best: ${best} pts` : 'Same 7 for everyone today';
  }

  // ── seeded mode ──
  const SEED_A = 'red,blue,green,gold,pink,tiny,giant,lucky,sneaky,salty,spicy,frozen,cosmic,sleepy,wild,shiny,fuzzy,brave,silly,secret'.split(',');
  const SEED_B = 'otter,tiger,mango,panda,rocket,pickle,falcon,waffle,cactus,llama,squid,taco,comet,badger,noodle,walrus,pepper,koala,dragon,muffin'.split(',');
  const randomSeed = () => `${pick(SEED_A, Math.random)}-${pick(SEED_B, Math.random)}-${Math.floor(Math.random() * 90 + 10)}`;
  const cleanSeed = (s) => s.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40);
  const seedLink = (s) => `${location.origin}${location.pathname}?seed=${encodeURIComponent(s)}`;

  function openSeed(prefill) {
    clearTimers();
    game = null;
    current = null;
    $('seed-input').value = prefill || randomSeed();
    show('seed');
    setTimeout(() => { $('seed-input').focus(); $('seed-input').select(); }, 200);
  }
  $('seed-dice').addEventListener('click', () => {
    $('seed-input').value = randomSeed();
    FX.shake($('seed-dice'), 'roll');
    sfx.blip(Math.floor(Math.random() * 5));
    $('seed-input').focus();
  });
  $('seed-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const s = cleanSeed($('seed-input').value);
    if (!s) { FX.shake($('seed-input').parentElement); sfx.wrong(); return; }
    startGame('seeded', null, s);
  });
  $('seed-back').addEventListener('click', goHome);

  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.mode === 'seeded') { sfx.blip(2); openSeed(); } else startGame(b.dataset.mode);
  }));
  $('categories').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (b) startGame('dive', b.dataset.cat);
  });
  $('answer-form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  // Editing the answer cancels any pending confirmation.
  $('answer').addEventListener('input', () => {
    if (!current || current.phase !== 'answering') return;
    if (current.pending || current.choices) clearAsk();
    $('input-wrap').classList.remove('bad');
    setFeedback('');
  });
  document.addEventListener('keydown', (e) => {
    if (showing === 'round' && current && current.choices && /^[1-4]$/.test(e.key) && current.choices[+e.key - 1]) {
      e.preventDefault();
      lockIn(current.choices[+e.key - 1]);
    } else if (showing === 'reveal' && e.key === 'Enter') {
      e.preventDefault();
      if (Date.now() >= revealReadyAt) nextRound();
    }
  });
  $('next-btn').addEventListener('click', () => { if (Date.now() >= revealReadyAt) nextRound(); });
  $('again-btn').addEventListener('click', () => (game.mode === 'seeded' ? openSeed() : startGame(game.mode, game.category)));
  $('home-btn').addEventListener('click', goHome);
  $('share-btn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(game.shareText); $('share-btn').textContent = '✅ Copied!'; }
    catch { $('share-btn').textContent = 'Copy failed'; }
  });
  const soundBtn = $('sound-btn');
  const renderSound = () => { soundBtn.textContent = FX.isMuted() ? '🔇' : '🔊'; };
  soundBtn.addEventListener('click', () => { FX.setMuted(!FX.isMuted()); renderSound(); if (!FX.isMuted()) sfx.blip(3); });
  renderSound();

  renderCategories();
  renderDaily();
  // A shared link (?seed=…) opens straight into that seed.
  try {
    const shared = new URLSearchParams(location.search).get('seed');
    if (shared) openSeed(cleanSeed(shared));
  } catch {}
  // Warm a few popular pools in the background so the first rounds start fast.
  ['country', 'animal', 'film', 'food'].forEach((p) => {
    const e = LETTERS.find((l) => l.id === 'pool:' + p) || FIXED.find((f) => f.id === 'pool:' + p);
    if (e) loadPool(e).catch(() => {});
  });
})();
