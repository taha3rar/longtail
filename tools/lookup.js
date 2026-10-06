// usage: node tools/lookup.js "owl" "chicken breed" ...  -> top Wikidata matches
(async () => {
  for (const term of process.argv.slice(2)) {
    const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=4&search=${encodeURIComponent(term)}`, { headers: { 'User-Agent': 'LongTailGameValidator/0.1' } });
    const j = await r.json();
    console.log(term.padEnd(22), '|', j.search.map((s) => `${s.id} ${s.label} (${s.description || ''})`).join(' | '));
  }
})();
