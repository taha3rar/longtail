// Question bank. Answers are NOT stored here: every question points at a
// Wikidata query, and the accepted answers + their popularity are fetched
// live when it's played.
//
// A source is { w, m } (SPARQL pattern binding ?item, min sitelinks) or
// { parts: [...] } for big classes that are merged from several fast queries.
// QUESTIONS are fixed prompts; TEMPLATES generate letter challenges
// ("Name an animal starting with P") on the fly from a pool.
// Keep prompts casual general knowledge: things anyone could name a few of.
// Run `node tools/validate.js` after editing.
(function () {
  const isA = (q, m) => ({ w: `?item wdt:P31 wd:${q} .`, m });
  const kindOf = (q, m) => ({ w: `{ ?item wdt:P31 wd:${q} } UNION { ?item wdt:P279 wd:${q} }`, m });
  const tree = (q, m) => ({ w: `?item wdt:P31/wdt:P279* wd:${q} .`, m });
  const sub = (q, m) => ({ w: `?item wdt:P279+ wd:${q} .`, m }); // kinds of a thing (a toaster is a kind of appliance)
  const isOrSub = (q, m) => ({ w: `{ ?item wdt:P31 wd:${q} } UNION { ?item wdt:P279+ wd:${q} }`, m });
  const under = (q, m) => ({ w: `?item wdt:P171+ wd:${q} .`, m }); // any rank below a taxon
  const shallow = (q, m) => ({ w: `{ VALUES ?item { wd:${q} } } UNION { ?item wdt:P171 wd:${q} } UNION { ?item wdt:P171/wdt:P171 wd:${q} } UNION { ?item wdt:P171/wdt:P171/wdt:P171 wd:${q} }`, m });
  const filmWith = (q) => ({ w: `?item wdt:P161 wd:${q} . ?item wdt:P31 wd:Q11424 .` });
  const playedFor = (q, m = 10) => ({ w: `?item wdt:P54 wd:${q} . ?item wdt:P31 wd:Q5 .`, m });
  const job = (q, m) => ({ w: `?item wdt:P106 wd:${q} . ?item wdt:P31 wd:Q5 .`, m });
  const held = (q) => ({ w: `?item wdt:P39 wd:${q} .` });
  const characterIn = (q) => ({ w: `?item wdt:P1080 wd:${q} . ?item wdt:P31/wdt:P279* wd:Q95074 .` });
  const dish = (country) => ({ w: `?item wdt:P31/wdt:P279* wd:Q746549 . ?item wdt:P495 wd:${country} .`, m: 3 });
  const country = (where) => ({ w: `?item wdt:P31 wd:Q3624078 .${where ? ` ?item wdt:P30 wd:${where} .` : ''}` });
  // Everyday words looked up by their English Wikidata label, for things the
  // class tree misses (Wikidata doesn't file "toaster" under kitchen anything).
  // Fame still comes from Wikidata like everything else.
  const words = (list, extra = '') => ({
    w: `VALUES ?lbl { ${list.split(',').map((x) => JSON.stringify(x.trim()) + '@en').join(' ')} } ?item rdfs:label ?lbl . ${extra}`,
  });

  const ANIMAL_WORDS = 'bee,ant,butterfly,moth,ladybird,earthworm,worm,snail,slug,jellyfish,firefly,dinosaur,shark,lizard,' +
    'scorpion,elephant,snake,insect,lobster,squid,octopus,crab,shrimp,frog,toad,turtle,tortoise,bird,fish,horse,cattle,cow,' +
    'pig,sheep,goat,chicken,duck,goose,dog,cat,mouse,rat,rabbit,deer,bear,wolf,fox,lion,tiger,monkey,ape,whale,dolphin,seal,' +
    'penguin,owl,eagle,hawk,parrot,pigeon,crow,beetle,fly,mosquito,spider,cockroach,grasshopper,cricket,wasp,hornet,termite,' +
    'caterpillar,starfish,coral,sponge,camel,giraffe,zebra,hippopotamus,rhinoceros,kangaroo,koala,panda,gorilla,chimpanzee,' +
    'squirrel,hedgehog,bat,otter,beaver,raccoon,skunk,badger,mole,llama,alpaca,donkey,mule,ostrich,flamingo,swan,peacock,' +
    'turkey,vulture,falcon,hummingbird,woodpecker,crocodile,alligator,chameleon,gecko,iguana,python,cobra,salamander,newt,' +
    'eel,salmon,tuna,trout,cod,catfish,goldfish,clam,oyster,mussel,walrus,moose,bison,buffalo,yak,hamster,ferret,' +
    'leopard,cheetah,jaguar,hyena,lynx,puma,sloth,armadillo,anteater,platypus,lemur,meerkat,mongoose,seahorse,stingray';
  const animalWords = words(ANIMAL_WORDS, '?item wdt:P31 ?t . VALUES ?t { wd:Q55983715 wd:Q16521 wd:Q502895 }');

  const KITCHEN_APPLIANCES = 'toaster,microwave oven,refrigerator,freezer,dishwasher,oven,stove,kitchen stove,electric kettle,kettle,' +
    'blender,food processor,stand mixer,hand mixer,coffeemaker,espresso machine,rice cooker,slow cooker,pressure cooker,' +
    'air fryer,deep fryer,toaster oven,waffle iron,sandwich toaster,juicer,bread machine,ice cream maker,popcorn maker,egg cooker,' +
    'induction cooker,hot plate,electric stove,gas stove,kitchen hood,garbage disposal unit,water dispenser,ice maker,food dehydrator,' +
    'sous vide,immersion blender,electric grill,griddle,crepe maker,yogurt maker,soy milk maker,coffee grinder,milk frother,' +
    'electric can opener,electric knife,kitchen scale,dish drying cabinet,wine cooler,chest freezer,steam oven,convection oven,' +
    'Thermomix,Instant Pot,KitchenAid,Nespresso,water filter,coffee machine,panini press,sandwich maker,' +
    'meat grinder,pasta machine,electric frying pan,warming drawer,bottle warmer,sterilizer,salad spinner,mandoline';
  const BATHROOM_THINGS = 'towel,toilet paper,toothbrush,comb,hairbrush,razor,hair dryer,bath mat,shower curtain,mirror,bathroom scale,' +
    'soap,sponge,loofah,cotton swab,dental floss,mouthwash,tweezers,nail clipper,bathrobe,toilet brush,plunger,laundry basket,' +
    'medicine cabinet,towel rail,deodorant,lotion,hair conditioner,shaving cream,aftershave,rubber duck,bath bomb,tampon,' +
    'sanitary napkin,contact lens,hair gel,toilet,toothpaste,shampoo,bathtub,shower,sink,bidet,electric toothbrush,shower gel,' +
    'bubble bath,cotton pad,face mask,nail file,electric razor,straight razor,safety razor,hair straightener,curling iron,' +
    'toilet seat,urinal,towel warmer,bath salts,pumice,body wash,hairspray,perfume,cosmetics,soap dish,shower head,shower cap,' +
    'washcloth,hot water bottle,first aid kit,thermometer,adhesive bandage,cotton wool,nail polish remover,hair tie,bobby pin,' +
    'dry shampoo,moisturizer,sunscreen,lip balm,mascara,lipstick,eyeliner,foundation,concealer,exfoliation,face wash,cleanser,' +
    'toner,hand sanitizer,air freshener,bleach,toilet cleaner,bath toy,potty,nappy,diaper,wet wipe,tissue,facial tissue';
  const SECURITY_THINGS = 'smoke detector,burglar alarm,security alarm,closed-circuit television,security camera,motion detector,safe,' +
    'deadbolt,peephole,intercom,video doorbell,doorbell,security light,keypad,door chain,guard dog,fence,gate,window bars,' +
    'panic button,smart lock,padlock,lock,key,carbon monoxide detector,fire alarm,smart doorbell,floodlight,baby monitor,shutter,' +
    'security door,electric fence,barbed wire,razor wire,lock box,key safe,infrared sensor,glass break detector,spyhole,panic room,' +
    'pepper spray,fire extinguisher,fire sprinkler,fire blanket,flashlight,access control,fingerprint scanner,keycard,' +
    'combination lock,cylinder lock,mortise lock,latch,chain lock,door lock,window lock,alarm system,smart home,' +
    'security guard,watchdog,motion sensor,surveillance camera';

  const POOLS = {
    animal: { parts: [
      animalWords,
      under('Q25306', 20), under('Q7380', 20), under('Q10850', 25), under('Q160', 15), under('Q25329', 20),
      under('Q25374', 15), under('Q25336', 15), under('Q28425', 25), under('Q25401', 15), under('Q2372824', 5),
      under('Q223044', 15), under('Q25363', 10), under('Q5113', 40), under('Q127282', 40), under('Q10908', 30),
      under('Q128257', 15), shallow('Q25537662', 12), shallow('Q22651', 12), shallow('Q22671', 12),
      shallow('Q25312', 12), shallow('Q1357', 12),
    ] },
    food: { parts: [
      kindOf('Q3314483', 3), kindOf('Q11004', 3), kindOf('Q10943'), kindOf('Q178'), kindOf('Q7802', 3),
      kindOf('Q182940', 3), kindOf('Q13276', 2), kindOf('Q41415', 2), kindOf('Q178359', 2), kindOf('Q28803', 2),
      kindOf('Q185583', 2), kindOf('Q477248', 2), kindOf('Q131419', 2), kindOf('Q9266', 2), kindOf('Q42527'),
      dish('Q17'), dish('Q38'), dish('Q668'), dish('Q142'), dish('Q96'), dish('Q148'),
    ] },
    country: country(),
    capital: { w: `?c wdt:P31 wd:Q3624078 . ?c wdt:P36 ?item .` },
    city: { parts: [isA('Q515', 60), { w: `?c wdt:P31 wd:Q3624078 . ?c wdt:P36 ?item .` }] },
    usState: isA('Q35657'),
    usCity: { w: `?item wdt:P31/wdt:P279* wd:Q515 . ?item wdt:P17 wd:Q30 .`, m: 15 },
    film: isA('Q11424', 45),
    tvShow: isA('Q5398426', 50),
    famousPerson: { parts: [
      job('Q10800557', 100), job('Q937857', 100), job('Q82955', 160), job('Q43845', 70),
      job('Q17125263', 25), job('Q947873', 60), job('Q3665646', 50), job('Q177220', 80),
    ] },
    brand: { parts: [isA('Q431289', 15), isA('Q891723', 50), isA('Q4830453', 50), isA('Q6881511', 40)] },
    pokemon: tree('Q3966183'),
    dogBreed: isA('Q39367'),
    hpCharacter: characterIn('Q5410773'),
    sport: isA('Q31629', 10),
    color: isA('Q1075', 3),
    carMaker: isA('Q786820', 5),
    fruit: kindOf('Q3314483', 3),
    vegetable: kindOf('Q11004', 3),
    bird: under('Q5113', 40),
    job: { parts: [sub('Q12737077', 15), sub('Q28640', 10)] },
    instrument: sub('Q34379', 12),
    vehicle: sub('Q42889', 30),
    clothing: sub('Q11460', 8),
    kitchen: { parts: [sub('Q1521410', 3), words(KITCHEN_APPLIANCES)] },
    tool: { parts: [sub('Q2578402', 4), sub('Q1327701', 3), sub('Q1494647', 2)] },
    dance: { parts: [isA('Q107357104', 2), sub('Q11639', 3)] },
  };

  // c = category shown on the home screen.
  window.QUESTIONS = [
    // ── Around the house ──
    { q: 'Name an electrical appliance you\'d find in a kitchen', c: 'Home', ...words(KITCHEN_APPLIANCES) },
    { q: 'Name something you\'d find in a kitchen', c: 'Home', pool: 'kitchen' },
    { q: 'Name a kitchen utensil', c: 'Home', ...sub('Q3773693', 2) },
    { q: 'Name something you\'d find in a bathroom', c: 'Home', parts: [words(BATHROOM_THINGS), sub('Q2024731', 2), sub('Q131207', 3)] },
    { q: 'Name something that keeps a home safe or secure', c: 'Home', parts: [words(SECURITY_THINGS), sub('Q228039', 1), sub('Q945434', 1)] },
    { q: 'Name a room you\'d find in a building', c: 'Home', ...sub('Q180516', 3) },
    { q: 'Name a type of building', c: 'Home', ...sub('Q41176', 10) },
    { q: 'Name a piece of furniture', c: 'Home', ...kindOf('Q14745', 5) },
    { q: 'Name a tool', c: 'Home', pool: 'tool' },
    { q: 'Name a garden tool', c: 'Home', ...sub('Q1494647', 2) },
    { q: 'Name a cleaning tool', c: 'Home', ...sub('Q26270576', 2) },
    { q: 'Name an electronic gadget', c: 'Home', ...sub('Q581105', 8) },
    { q: 'Name a type of bag', c: 'Home', ...sub('Q1323314', 3) },
    { q: 'Name something you\'d find in a pencil case or office', c: 'Home', parts: [sub('Q875696', 4), sub('Q121916', 2)] },
    { q: 'Name a makeup or beauty product', c: 'Home', ...sub('Q131207', 3) },
    { q: 'Name a toy', c: 'Home', ...sub('Q11422', 4) },

    // ── Animals ──
    { q: 'Name an animal', c: 'Animals', pool: 'animal' },
    { q: 'Name a dog breed', c: 'Animals', pool: 'dogBreed' },
    { q: 'Name a cat breed', c: 'Animals', ...isA('Q43577') },
    { q: 'Name a bird', c: 'Animals', pool: 'bird' },
    { q: 'Name a fish', c: 'Animals', ...under('Q127282', 30) },
    { q: 'Name a carnivore (meat-eating mammal)', c: 'Animals', ...under('Q25306', 15) },
    { q: 'Name a whale or dolphin', c: 'Animals', ...under('Q160', 5) },
    { q: 'Name a monkey or ape', c: 'Animals', ...under('Q7380', 10) },
    { q: 'Name a rodent', c: 'Animals', ...under('Q10850', 15) },
    { q: 'Name an animal with hooves', c: 'Animals', parts: [under('Q25329', 15), under('Q25374', 10)] },
    { q: 'Name a reptile', c: 'Animals', parts: [shallow('Q25537662', 8), under('Q223044', 10), under('Q25363', 5), under('Q122422', 30)] },
    { q: 'Name an insect or bug', c: 'Animals', parts: [shallow('Q22651', 8), shallow('Q22671', 8), shallow('Q25312', 8), shallow('Q25375', 8), shallow('Q167810', 8), shallow('Q25309', 8), shallow('Q1357', 8)] },
    { q: 'Name a sea creature', c: 'Animals', parts: [under('Q160', 10), under('Q128257', 10), under('Q25364', 25), shallow('Q7372', 8), under('Q25349', 8)] },
    { q: 'Name a Pokémon', c: 'Animals', pool: 'pokemon' },
    { q: 'Name a mythical creature', c: 'Animals', ...isA('Q2239243', 3) },
    { q: 'Name a tree', c: 'Animals', ...isOrSub('Q10884', 5) },

    // ── Food ──
    { q: 'Name a food', c: 'Food', pool: 'food' },
    { q: 'Name a fruit', c: 'Food', pool: 'fruit' },
    { q: 'Name a vegetable', c: 'Food', pool: 'vegetable' },
    { q: 'Name a cheese', c: 'Food', ...kindOf('Q10943') },
    { q: 'Name a type of pasta', c: 'Food', ...kindOf('Q178') },
    { q: 'Name a type of bread', c: 'Food', ...kindOf('Q7802', 3) },
    { q: 'Name a dessert', c: 'Food', ...kindOf('Q182940', 3) },
    { q: 'Name a cake', c: 'Food', ...kindOf('Q13276', 2) },
    { q: 'Name a soup', c: 'Food', ...kindOf('Q41415', 2) },
    { q: 'Name a sauce', c: 'Food', ...kindOf('Q178359', 2) },
    { q: 'Name a spice', c: 'Food', ...kindOf('Q42527') },
    { q: 'Name a herb', c: 'Food', ...kindOf('Q207123') },
    { q: 'Name a cocktail', c: 'Food', ...kindOf('Q134768') },
    { q: 'Name a sandwich', c: 'Food', ...kindOf('Q28803', 2) },
    { q: 'Name a candy or sweet', c: 'Food', ...kindOf('Q185583', 2) },
    { q: 'Name a pastry', c: 'Food', ...kindOf('Q477248', 2) },
    { q: 'Name a cookie or biscuit', c: 'Food', ...kindOf('Q13270', 2) },
    { q: 'Name a coffee drink', c: 'Food', ...kindOf('Q8486', 2) },
    { q: 'Name a type of tea', c: 'Food', ...kindOf('Q6097', 2) },
    { q: 'Name a soft drink', c: 'Food', ...kindOf('Q147538', 2) },
    { q: 'Name an Italian dish', c: 'Food', ...dish('Q38') },
    { q: 'Name a Japanese dish', c: 'Food', ...dish('Q17') },
    { q: 'Name an Indian dish', c: 'Food', ...dish('Q668') },
    { q: 'Name a Chinese dish', c: 'Food', ...dish('Q148') },
    { q: 'Name a fast food chain', c: 'Food', ...isA('Q18509232') },

    // ── Places ──
    { q: 'Name a country', c: 'Places', pool: 'country' },
    { q: 'Name a country in Africa', c: 'Places', ...country('Q15') },
    { q: 'Name a country in Europe', c: 'Places', ...country('Q46') },
    { q: 'Name a country in Asia', c: 'Places', ...country('Q48') },
    { q: 'Name a capital city', c: 'Places', pool: 'capital' },
    { q: 'Name a city', c: 'Places', pool: 'city' },
    { q: 'Name a US state', c: 'Places', pool: 'usState' },
    { q: 'Name a city in the USA', c: 'Places', pool: 'usCity' },
    { q: 'Name an island', c: 'Places', ...isA('Q23442', 25) },
    { q: 'Name a sea or ocean', c: 'Places', ...isA('Q165') },
    { q: 'Name a language', c: 'Places', ...isA('Q34770', 30) },
    { q: 'Name a currency', c: 'Places', ...isA('Q8142', 10) },
    { q: 'Name a place in Harry Potter', c: 'Places', w: `?item wdt:P1080 wd:Q5410773 . ?item wdt:P31/wdt:P279* wd:Q3895768 .` },

    // ── Screen ──
    { q: 'Name a movie', c: 'Screen', pool: 'film' },
    { q: 'Name a TV show', c: 'Screen', pool: 'tvShow' },
    { q: 'Name a Harry Potter character', c: 'Screen', pool: 'hpCharacter' },
    { q: 'Name a Simpsons character', c: 'Screen', w: `?item wdt:P1441 wd:Q886 .` },
    { q: 'Name a DC superhero or villain', c: 'Screen', w: `?item wdt:P1080 wd:Q1152150 .`, m: 5 },
    { q: 'Name a Pixar movie', c: 'Screen', w: `?item wdt:P272 wd:Q127552 . ?item wdt:P31/wdt:P279* wd:Q11424 .` },
    { q: 'Name a Disney animated movie', c: 'Screen', w: `?item wdt:P31 wd:Q202866 . ?item wdt:P272 ?s . VALUES ?s { wd:Q1047410 wd:Q191224 }` },
    { q: 'Name a horror movie', c: 'Screen', w: `?item wdt:P136 wd:Q200092 . ?item wdt:P31 wd:Q11424 .`, m: 25 },
    { q: 'Name a sitcom', c: 'Screen', w: `?item wdt:P136 wd:Q170238 .`, m: 12 },
    { q: 'Name a Netflix series', c: 'Screen', w: `?item wdt:P449 wd:Q907311 . ?item wdt:P31 wd:Q5398426 .`, m: 8 },
    { q: 'Name an anime', c: 'Screen', ...isA('Q63952888', 12) },
    { q: 'Name a Tom Hanks movie', c: 'Screen', ...filmWith('Q2263') },
    { q: 'Name a Leonardo DiCaprio movie', c: 'Screen', ...filmWith('Q38111') },
    { q: 'Name a Tom Cruise movie', c: 'Screen', ...filmWith('Q37079') },
    { q: 'Name a Will Smith movie', c: 'Screen', ...filmWith('Q40096') },
    { q: 'Name a Jim Carrey movie', c: 'Screen', ...filmWith('Q40504') },
    { q: 'Name a Dwayne "The Rock" Johnson movie', c: 'Screen', ...filmWith('Q10738') },
    { q: 'Name an Adam Sandler movie', c: 'Screen', ...filmWith('Q132952') },
    { q: 'Name a Jackie Chan movie', c: 'Screen', ...filmWith('Q36970') },
    { q: 'Name an Arnold Schwarzenegger movie', c: 'Screen', ...filmWith('Q2685') },
    { q: 'Name a video game series', c: 'Screen', ...isA('Q7058673', 12) },

    // ── Music & Fun ──
    { q: 'Name a musical instrument', c: 'Fun', pool: 'instrument' },
    { q: 'Name a music genre', c: 'Fun', ...isA('Q188451', 20) },
    { q: 'Name a dance', c: 'Fun', pool: 'dance' },
    { q: 'Name a hobby', c: 'Fun', ...isOrSub('Q47728', 5) },
    { q: 'Name a board game', c: 'Fun', ...isA('Q131436', 5) },
    { q: 'Name a card game', c: 'Fun', ...isA('Q142714', 3) },

    // ── Sport ──
    { q: 'Name a sport', c: 'Sport', pool: 'sport' },
    { q: 'Name a piece of sports equipment', c: 'Sport', ...sub('Q768186', 4) },
    { q: 'Name a martial art', c: 'Sport', ...kindOf('Q11417', 3) },
    { q: 'Name an NBA team', c: 'Sport', w: `?item wdt:P118 wd:Q155223 . ?item wdt:P31 wd:Q13393265 .` },
    { q: 'Name an NFL team', c: 'Sport', w: `?item wdt:P118 wd:Q1215884 . ?item wdt:P31 wd:Q17156793 .` },
    { q: 'Name a football (soccer) player', c: 'Sport', ...job('Q937857', 60) },
    { q: 'Name a basketball player', c: 'Sport', ...job('Q3665646', 30) },
    { q: 'Name a Real Madrid player', c: 'Sport', ...playedFor('Q8682') },
    { q: 'Name an FC Barcelona player', c: 'Sport', ...playedFor('Q7156') },
    { q: 'Name a Manchester United player', c: 'Sport', ...playedFor('Q18656') },
    { q: 'Name a tennis player', c: 'Sport', ...job('Q10833314', 50) },
    { q: 'Name a boxer', c: 'Sport', ...job('Q11338576', 40) },
    { q: 'Name a Formula 1 driver', c: 'Sport', ...job('Q10841764', 20) },

    // ── People ──
    { q: 'Name a famous person', c: 'People', pool: 'famousPerson' },
    { q: 'Name a job', c: 'People', pool: 'job' },
    { q: 'Name a US president', c: 'People', ...held('Q11696') },
    { q: 'Name a Greek god or goddess', c: 'People', ...isA('Q22989102') },
    { q: 'Name a famous scientist', c: 'People', ...job('Q901', 60) },
    { q: 'Name a comedian', c: 'People', ...job('Q245068', 40) },
    { q: 'Name a YouTuber', c: 'People', ...job('Q17125263', 15) },

    // ── Stuff ──
    { q: 'Name a color', c: 'Stuff', pool: 'color' },
    { q: 'Name a car brand', c: 'Stuff', pool: 'carMaker' },
    { q: 'Name a brand', c: 'Stuff', pool: 'brand' },
    { q: 'Name a vehicle', c: 'Stuff', pool: 'vehicle' },
    { q: 'Name an item of clothing', c: 'Stuff', pool: 'clothing' },
    { q: 'Name something you wear on your head', c: 'Stuff', ...sub('Q14952', 3) },
    { q: 'Name something you wear on your feet', c: 'Stuff', ...sub('Q161928', 3) },
    { q: 'Name a piece of jewelry', c: 'Stuff', ...sub('Q2142903', 2) },
    { q: 'Name a social media app', c: 'Stuff', ...isA('Q3220391', 5) },
    { q: 'Name a type of weather', c: 'Stuff', ...isOrSub('Q11663', 3) },
    { q: 'Name a natural disaster', c: 'Stuff', ...sub('Q8065', 3) },
    { q: 'Name a chemical element', c: 'Stuff', ...isA('Q11344') },
    { q: 'Name a gemstone', c: 'Stuff', ...kindOf('Q83437', 3) },
    { q: 'Name a disease or illness', c: 'Stuff', ...isA('Q112193867', 30) },
    { q: 'Name a phobia', c: 'Stuff', ...kindOf('Q175854') },
    { q: 'Name an emotion', c: 'Stuff', ...kindOf('Q9415', 10) },
    { q: 'Name a holiday or festival', c: 'Stuff', ...tree('Q1197685', 15) },
    { q: 'Name a religion', c: 'Stuff', ...isA('Q9174', 10) },
    { q: 'Name a type of boat', c: 'Stuff', ...kindOf('Q1229765', 8) },
  ];

  // Letter challenges. kinds: start, end, has (letter or pair), len, double.
  // `noun` slots into "Name ___ starting with P".
  window.TEMPLATES = [
    { noun: 'an animal', c: 'Animals', pool: 'animal', kinds: ['start', 'start', 'end', 'has', 'len', 'double'] },
    { noun: 'a bird', c: 'Animals', pool: 'bird', kinds: ['start'] },
    { noun: 'a dog breed', c: 'Animals', pool: 'dogBreed', kinds: ['start'] },
    { noun: 'a Pokémon', c: 'Animals', pool: 'pokemon', kinds: ['start', 'end'] },
    { noun: 'a food', c: 'Food', pool: 'food', kinds: ['start', 'start', 'has', 'double'] },
    { noun: 'a fruit', c: 'Food', pool: 'fruit', kinds: ['start'] },
    { noun: 'a vegetable', c: 'Food', pool: 'vegetable', kinds: ['start'] },
    { noun: 'a country', c: 'Places', pool: 'country', kinds: ['start', 'start', 'end', 'end', 'has', 'len', 'double'] },
    { noun: 'a capital city', c: 'Places', pool: 'capital', kinds: ['start', 'end'] },
    { noun: 'a city', c: 'Places', pool: 'city', kinds: ['start', 'end', 'has'] },
    { noun: 'a US state', c: 'Places', pool: 'usState', kinds: ['start', 'has', 'end'] },
    { noun: 'a city in the USA', c: 'Places', pool: 'usCity', kinds: ['start'] },
    { noun: 'a movie', c: 'Screen', pool: 'film', kinds: ['start', 'start', 'has'] },
    { noun: 'a TV show', c: 'Screen', pool: 'tvShow', kinds: ['start'] },
    { noun: 'a Harry Potter character', c: 'Screen', pool: 'hpCharacter', kinds: ['start'] },
    { noun: 'a famous person', c: 'People', pool: 'famousPerson', kinds: ['start'] },
    { noun: 'a job', c: 'People', pool: 'job', kinds: ['start', 'end'] },
    { noun: 'a sport', c: 'Sport', pool: 'sport', kinds: ['start', 'has'] },
    { noun: 'a musical instrument', c: 'Fun', pool: 'instrument', kinds: ['start'] },
    { noun: 'a dance', c: 'Fun', pool: 'dance', kinds: ['start'] },
    { noun: 'a brand', c: 'Stuff', pool: 'brand', kinds: ['start', 'start'] },
    { noun: 'a car brand', c: 'Stuff', pool: 'carMaker', kinds: ['start'] },
    { noun: 'a color', c: 'Stuff', pool: 'color', kinds: ['start'] },
    { noun: 'a vehicle', c: 'Stuff', pool: 'vehicle', kinds: ['start'] },
    { noun: 'an item of clothing', c: 'Stuff', pool: 'clothing', kinds: ['start'] },
    { noun: 'something in a kitchen', c: 'Home', pool: 'kitchen', kinds: ['start'] },
    { noun: 'a tool', c: 'Home', pool: 'tool', kinds: ['start'] },
  ];

  window.POOLS = POOLS;
})();
