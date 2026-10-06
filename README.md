# Long Tail

An unlimited take on the "give the least obvious correct answer" trivia format (like Krillion).
Prompts like *Name an animal starting with P* or *Name a Tom Hanks movie*: valid answers score more the less famous they are.

## Play

**▶ https://taha3rar.github.io/longtail/**

Or open `index.html` locally (double-click works, no server or build needed). Needs an internet connection. 🔊 toggles sound.

## Rules

- **Dive**: 7 random prompts. **Daily**: the same 7 for everyone on a given date. **Endless**: keep going until 3 misses. **Seeded**: type a seed (or roll 🎲 for one). The same seed gives everyone the same 7 prompts and hidden gems, so you can compete with friends. The result you copy includes a link like `?seed=salty-otter-42` that opens straight into that seed. Or pick a category (including 🔤 Letters).
- 3-2-1, then 25 seconds. Type an answer and press **Enter**. The game asks "Lock in X?" (or "Did you mean X?", or "Which one?"). Press **Enter** again to lock it in.
- If time runs out while an answer is waiting to be confirmed, it counts. Editing or deleting the text cancels it.
- Tiers: Obvious 10 · Too Clever 15 · Common 30 · Rare 60 · Deep Cut 85 · The Gem 100 (one hidden answer per prompt).
- Reusing an answer you've already scored on the same prompt drops it to **Too Clever**.

## Questions

`js/questions.js` has:

- **~135 fixed prompts**, all casual general knowledge: around the house (kitchen, bathroom, security, tools), animals, food, places, movies, sport, famous people and more. Nothing that needs specialist knowledge.
- **Letter challenges**, generated on the fly from big pools: starts with / ends with / contains a letter or pair / exact length / double letter. For example "Name a country ending in A" or "Name a food containing 'OO'". The game only picks rules that have enough valid answers. Your answer is judged on the name you typed ("puma" counts for P even though the animal is listed as Cougar).
- **Pools**: reusable answer lists. Big ones like "any animal" or "any food" are merged from ~20 fast Wikidata queries, because one big query times out.

Nothing is pre-filled. Answers and their fame (the number of Wikipedia languages covering each thing) are fetched live and cached in the browser for 7 days. Tiers are by fame rank: roughly top 1% Obvious, top 7% Common, top 25% Rare, rest Deep Cut.

## Matching (`js/fuzzy.js`)

Matching happens only when you press Enter. There is no dropdown, because that would give answers away.

- Forgiven: accents, punctuation, "the", plurals, word order, typos (`rotweiler`, `golden retreiver`), sound-alikes (`chiwawa`), nicknames and aliases (`sausage dog`, `lab`), surnames (`lincoln`, `eisenhauer`), and leaving out generic words (`persian` → Persian cat).
- Not forgiven: half-typed words (`w`, `wol`, `german shep`), and typos in short words or in the first letter (`lion` won't become "León", `titanic` won't become "Itanic").
- Ambiguous answers ask you to pick: `bush` → George W. / George H. W.

## Tools

- `node tools/validate.js [filter]`: runs pools and questions against Wikidata and flags slow, small or failing ones.
- `node tools/try-fuzzy.js "<question or pool id>" word1 word2`: tests the matcher against a live pool.
- `node tools/lookup.js "owl"`: finds Wikidata IDs. `node tools/rawq.js "<sparql>"`: times a raw query.
