// usage: node tools/classes.js "home appliance" "kitchen utensil" ...
// Finds Wikidata classes by exact English label and counts their direct subclasses.
const labels = process.argv.slice(2);
const q = `SELECT ?item ?lbl (COUNT(DISTINCT ?sub) AS ?subs) ?desc WHERE {
  VALUES ?lbl { ${labels.map((l) => JSON.stringify(l) + '@en').join(' ')} }
  ?item rdfs:label ?lbl .
  OPTIONAL { ?sub wdt:P279 ?item . }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
} GROUP BY ?item ?lbl ?desc ORDER BY ?lbl DESC(?subs)`;
fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'LongTailGameValidator/0.1' } })
  .then((r) => r.json())
  .then((j) => {
    for (const b of j.results.bindings) {
      if (+b.subs.value < 3) continue;
      console.log(`${b.lbl.value.padEnd(22)} ${b.item.value.split('/').pop().padEnd(11)} subclasses=${b.subs.value.padEnd(4)} ${(b.desc && b.desc.value || '').slice(0, 60)}`);
    }
  });
