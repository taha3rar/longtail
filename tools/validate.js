// Runs every pool and question against Wikidata and reports pool size, speed
// and the most famous answers, so broken or weak questions can be spotted.
// Usage: node tools/validate.js [filter text]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fetchPool } = require('../js/wikidata.js');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(process.env.QFILE || path.join(__dirname, '../js/questions.js'), 'utf8'), ctx);
const { QUESTIONS = [], POOLS = {} } = ctx.window;
const filter = (process.argv[2] || '').toLowerCase();
const ua = { 'User-Agent': 'LongTailGameValidator/0.1 (personal project)' };
const fetchUA = (url, opts) => fetch(url, { ...opts, headers: { ...opts.headers, ...ua } });

// At most 3 requests in flight overall (Wikidata allows ~5 per client).
let active = 0;
const waiting = [];
async function throttle(fn) {
  if (active >= 3) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; const next = waiting.shift(); if (next) next(); }
}

// Pools first, then fixed questions that don't reuse a pool.
const jobs = [
  ...Object.entries(POOLS).map(([id, src]) => ({ label: `[pool ${id}]`, src })),
  ...QUESTIONS.filter((q) => !q.pool).map((q) => ({ label: q.q, src: q })),
].filter((j) => j.label.toLowerCase().includes(filter));

async function check(job) {
  const t0 = Date.now();
  try {
    const items = await fetchPool(job.src, fetchUA, AbortSignal.timeout(45000), throttle);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const flag = items.length < 30 ? 'SMALL' : +secs > 20 ? 'SLOW' : items.partial ? 'PART' : 'ok';
    return `${flag.padEnd(5)} ${job.label} | n=${items.length} ${secs}s | ${items.slice(0, 6).map((x) => x.display).join(', ')}`;
  } catch (e) {
    return `FAIL  ${job.label} | ${e.message}`;
  }
}

(async () => {
  const queue = jobs.slice();
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) console.log(await check(queue.shift()));
  });
  await Promise.all(workers);
  console.log(`\n${QUESTIONS.length} fixed questions, ${(ctx.window.TEMPLATES || []).length} letter templates, ${Object.keys(POOLS).length} pools`);
})();
