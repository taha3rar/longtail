// Quick manual check of the matcher against a live pool.
// Usage: node tools/try-fuzzy.js "<question text or pool id>" query1 query2 ...
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fetchPool } = require('../js/wikidata.js');
const Fuzzy = require('../js/fuzzy.js');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/questions.js'), 'utf8'), ctx);
const { QUESTIONS, POOLS } = ctx.window;
const [key, ...inputs] = process.argv.slice(2);
const q = QUESTIONS.find((x) => x.q === key);
const source = POOLS[key] || (q && (q.pool ? POOLS[q.pool] : q));
if (!source) throw new Error('unknown question/pool: ' + key);

(async () => {
  const items = await fetchPool(source, (u, o) => fetch(u, { ...o, headers: { ...o.headers, 'User-Agent': 'LongTailGameValidator/0.1' } }));
  const index = Fuzzy.buildIndex(items);
  console.log(`${items.length} answers, ${index.entries.length} names`);
  for (const text of inputs) {
    const t0 = performance.now();
    const r = Fuzzy.check(index, text);
    const ms = (performance.now() - t0).toFixed(1);
    const show = (h) => `${h.item.display}${h.name !== h.item.display ? ` (via "${h.name}")` : ''} #${h.item.rank + 1}`;
    const verdict = r.item ? `${r.exact ? 'EXACT' : 'DID YOU MEAN'} ${show(r)}`
      : r.choices ? `WHICH ONE: ${r.choices.map(show).join(' / ')}` : 'NOTHING';
    console.log(`"${text}" (${ms}ms) → ${verdict}`);
  }
})();
