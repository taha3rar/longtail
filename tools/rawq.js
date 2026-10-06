// usage: node tools/rawq.js "<sparql>"  -> status, rows, seconds
(async () => {
  const t0 = Date.now();
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(process.argv[2]), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'LongTailGameValidator/0.1' }, signal: AbortSignal.timeout(70000) }).catch(e => ({ status: e.message }));
  let rows = '-';
  if (r.ok) rows = (await r.json()).results.bindings.length;
  console.log(r.status, rows, ((Date.now() - t0) / 1000).toFixed(1) + 's');
})();
