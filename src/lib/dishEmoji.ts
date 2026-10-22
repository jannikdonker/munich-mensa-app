import type { Dish } from './types'

// Picks an emoji for a dish from its (German or English) name, falling back to the
// counter (dish_type) and diet labels.
//
// Rules have a rank: dish forms (soup, curry, pizza …) beat specific ingredients
// (chicken, salmon …), which beat generic words (steak, braten …). Within a rank the
// match that ends last wins, which is the head of a German compound (Kartoffel|suppe)
// and usually of an English noun phrase (potato curry). Only the main part of the name,
// before "mit"/"with"/"auf"/…, is considered first.

type Rank = 1 | 2 | 3

interface Rule {
  rank: Rank
  emoji: string
  pattern: RegExp
  /** Ignored for dishes labelled vegetarian/vegan ("Tofugeschnetzeltes" is not a steak). */
  animal?: Animal
}

type Animal = 'meat' | 'fish'

// Word boundaries that understand umlauts (\b does not).
const START = '(?:^|[^a-zäöüß])'
const END = '(?![a-zäöüß])'

/** Fruit stems match to the end of the word, so "Erdbeeren" beats the generic "beere". */
const FRUIT = (stems: string) => `(?:${stems})[a-zäöüß]*`

const rule = (rank: Rank, emoji: string, source: string, animal?: Animal): Rule => ({
  rank,
  emoji,
  pattern: new RegExp(source, 'g'),
  animal,
})

const RULES: Rule[] = [
  // Dish forms
  rule(3, '🌭', 'wurst|würstchen|würstl|wiener(?![- ](?:art|style|schnitzel))|sausage|hot ?dog|frankfurter'),
  rule(3, '🍕', 'pizza|flammkuchen|calzone'),
  rule(3, '🍔', 'burger'),
  rule(3, '🧆', 'falafel'),
  rule(3, '🥙', 'dönn?er|kebab|gyros|shawarma|schawarma|dürüm|pita'),
  rule(3, '🌯', 'wrap|burrito|enchilada|quesadilla'),
  rule(3, '🌮', 'taco|nacho'),
  rule(3, '🥪', 'sandwich|panini|baguette|bagel|toast|semmel'),
  rule(3, '🍣', 'sushi|maki'),
  rule(3, '🍙', 'reisbällchen|rice ?balls?|onigiri|arancini'),
  rule(3, '🍢', 'spieß|spiess|skewer|schaschlik|satay|souvlaki'),
  rule(3, '🥢', 'frühlingsroll|spring ?roll'),
  rule(3, '🥟', 'maultasche|tasche|dumpling|gyoza|wan ?tan|momo|samosa|empanada|knödel|klöße|kloß|dampfnudel'),
  rule(3, '🍜', 'ramen|udon|soba|pho|glasnudel|reisnudel|rice noodle|mie-?nudel|asia-?nudel|asianoodle|asian noodle|bami goreng|chow mein|pad thai|noodle soup|nudelsuppe'),
  rule(3, '🍝', 'pasta|mezzalune|spaghetti|penne|fusilli|tagliatelle|pappardelle|lasagne|lasagna|makkaroni|maccheroni|macaroni|rigatoni|farfalle|linguine|gnocchi|nudel|noodle|spätzle|spaetzle|knöpfle|cannelloni|orzo|kritharaki|tortellini|tortelloni|ravioli|tortiglioni'),
  rule(3, '🍲', `suppe|soup|brühe|broth|bouillon|eintopf|stew|gulasch|goulash|ragout|ragù|${START}pot${END}|topf${END}`),
  rule(3, '🌶️', 'chili con|chili sin'),
  rule(3, '🍛', `curry|masala|korma|tikka|makhani|butter chicken|vindaloo|dahl|daal|${START}dal${END}`),
  rule(3, '🍚', 'nasi goreng|fried rice|bratreis|risotto|biryani|jambalaya'),
  rule(3, '🥗', 'salat|salad|bowl'),
  rule(3, '🥘', `gröstl|gröstel|${START}hash${END}|auflauf|casserole|gratin|pfanne|skillet|${START}pan(?![- ]?(?:fried|seared|cake))${END}|paella|shakshuka|frittata|tajine|tagine|moussaka|bake${END}`),
  rule(3, '🥞', 'pfannkuchen|pancake|crêpe|crepe|palatschinke|schmarrn'),
  rule(3, '🧇', 'waffel|waffle'),
  rule(3, '🥧', `strudel|quiche|tarte|${START}tart${END}|${START}pies?${END}`),
  rule(3, '🍰', 'kuchen|cake|torte|cheesecake|tiramisu|brownie|muffin'),
  rule(3, '🍮', `pudding|milk rice|creme|crème|cream(?!ed|y)|mousse|panna cotta|${START}flan${END}|trifle|triffle|grütze|grießbrei|milchreis`),
  rule(3, '🥣', 'porridge|oatmeal|haferflocken|brei|müsli|muesli|granola|quark|topfen|joghurt|jogurt|yogh?urt|skyr'),
  rule(3, '🍨', `${START}eis${END}|ice cream|sorbet|gelato`),
  rule(3, '🥨', 'brezel|breze|pretzel'),
  rule(3, '🍟', 'pommes|fries|wedges|kroketten|croquettes'),
  rule(3, '🍎', 'obstsalat|fruchtsalat|fruit salad'),
  rule(3, '🍳', 'omelett|omelette|spiegelei|rührei|scrambled|fried egg'),

  // Specific ingredients
  rule(2, '🍗', 'hähnchen|hühnchen|huhn|hendl|chicken|pute|truthahn|turkey|geflügel|poultry|ente|duck', 'meat'),
  rule(2, '🐟', 'fisch|fish|lachs|salmon|kabeljau|cod|seelachs|pollock|pollack|forelle|trout|thunfisch|tuna|zander|pike-?perch|plaice|saithe|scholle|matjes|hering|dorsch|pangasius|tilapia|seehecht|hake', 'fish'),
  rule(2, '🍤', 'garnele|shrimp|prawn|scampi|krabbe|meeresfrüchte|frutti di mare|seafood|calamari|tintenfisch|squid', 'fish'),
  rule(2, '🥩', `rind|beef|boeuf|stroganoff|kalb|veal|lamm|lamb|hirsch|venison|wildschwein|${START}reh${END}`, 'meat'),
  rule(2, '🍖', 'schweinelachs|schwein|pork|fleischbällchen|spareribs|ribs|haxe|kassler|speck|bacon|schinken|${START}ham${END}|leberkäs|fleischpflanz|frikadelle|hackbällchen|meatball|meatloaf|hackbraten|köfte|kofta|cevapcici|ćevapčići', 'meat'),
  rule(2, '🍠', 'süßkartoffel|suesskartoffel|sweet potato|batate'),
  rule(2, '🥔', 'kartoffel|potato|rösti|kartoffelpuffer|reiberdatschi|püree|puree|mash'),
  rule(2, '🍄', 'pilz|champignon|mushroom|pfifferling|kräuterseitling|shiitake'),
  rule(2, '🎃', 'kürbis|pumpkin|butternut|squash'),
  rule(2, '🍆', 'aubergine|eggplant'),
  rule(2, '🫑', 'paprika|bell pepper'),
  rule(2, '🥬', `grünkohl|rotkohl|weißkohl|weisskohl|spitzkohl|wirsing|mangold|${START}kale${END}|sauerkraut|cabbage`),
  rule(2, '🥦', 'brokkoli|broccoli|blumenkohl|cauliflower|gemüse|vegetable|veggie|zucchini|spinat|spinach'),
  rule(2, '🥕', 'karotte|möhre|carrot'),
  rule(2, '🍅', 'tomate|tomato'),
  rule(2, '🌽', `${START}mais${END}|${START}corn${END}`),
  rule(2, '🫘', 'linse|lentil|bohne|bean|kichererbse|chickpea|hummus|erbse|pea${END}'),
  rule(2, '🌾', 'bulgur|weizen|wheat|millet|couscous|quinoa|graupen|hirse|dinkel|getreide'),
  rule(2, '🍚', 'reis(?!el)|rice'),
  rule(2, '🧀', 'käse|cheese|mozzarella|feta|halloumi|camembert|gorgonzola|parmesan|obatzda|raclette'),
  rule(2, '🥚', `${START}eier?${END}|${START}eggs?${END}`),
  rule(2, '🥑', 'avocado|guacamole'),
  rule(2, '🍎', `${FRUIT('apfel|äpfel|apple|obst|fruit|frücht')}`),
  rule(2, '🍓', `${FRUIT('erdbeer|strawberr|himbeer|raspberr')}`),
  rule(2, '🫐', `${FRUIT('heidelbeer|blaubeer|blueberr|brombeer|blackberr|johannisbeer|currant|beere|berr')}`),
  rule(2, '🍒', `${FRUIT('kirsch|cherr')}`),
  rule(2, '🍑', `${FRUIT('pfirsich|peach|aprikose|marille|apricot|zwetschg|pflaume|plum')}`),
  rule(2, '🍌', `${FRUIT('banane|banana')}`),
  rule(2, '🍐', `birne|${START}pears?${END}`),
  rule(2, '🥭', 'mango'),
  rule(2, '🍍', 'ananas|pineapple'),
  rule(2, '🍋', `zitrone|lemon|limette|${START}limes?${END}`),
  rule(2, '🍫', 'schoko|chocolate|kakao|cocoa'),
  rule(2, '🥥', 'kokos|coconut'),

  // Generic words
  rule(1, '🥩', `schnitzel|steak|(?<!ge)braten${END}|roast|geschnetzelte|filet|fillet|medaillon|cordon bleu|roulade|fleisch(?!los)|meat`, 'meat'),
  rule(1, '🥢', 'tofu|tempeh|seitan|wok|teriyaki|asia|thai'),
]

const MAIN_PART_END = /\s(?:mit|with|auf|on|an|in|dazu|nach|vom|von|aus|from|oder|or|served|-)\s|[(,;|]/

const DISH_TYPE_RULES: [RegExp, string][] = [
  [/pasta/, '🍝'],
  [/pizza/, '🍕'],
  [/wok/, '🥢'],
  [/grill|fleisch(?!los)/, '🍖'],
  [/fisch/, '🐟'],
  [/supp|topf/, '🍲'],
  [/dessert|süß/, '🍮'],
  [/salat/, '🥗'],
  [/burger/, '🍔'],
]

interface Match {
  rank: Rank
  end: number
  length: number
  rule: Rule
}

function isBetter(a: Match, b: Match): boolean {
  return a.rank !== b.rank ? a.rank > b.rank : a.end !== b.end ? a.end > b.end : a.length > b.length
}

const PLANT_RULES = RULES.filter((r) => !r.animal)
const ANIMAL_RULES = RULES.filter((r) => r.animal)

function bestMatch(text: string, rules: Rule[]): Rule | undefined {
  let best: Match | undefined
  for (const rule of rules) {
    for (const m of text.matchAll(rule.pattern)) {
      const candidate = { rank: rule.rank, end: m.index + m[0].length, length: m[0].length, rule }
      if (!best || isBetter(candidate, best)) best = candidate
    }
  }
  return best?.rule
}

// "Blumenkohl-Kartoffel - Curry": a single trailing word after " - " still belongs to the compound.
const normalize = (name: string) => name.toLocaleLowerCase('de').replace(/\s+-\s+(?=\S+$)/, '-')

function bestNameMatch(dishName: string, rules: Rule[]): Rule | undefined {
  const name = normalize(dishName)
  return bestMatch(name.split(MAIN_PART_END)[0], rules) ?? bestMatch(name, rules)
}

/** Whether the name (or failing that, the counter) says the dish is meat or fish. */
export function animalIn(dish: Pick<Dish, 'name' | 'dish_type'>): Animal | undefined {
  const fromName = bestNameMatch(dish.name, ANIMAL_RULES)?.animal
  if (fromName) return fromName
  const type = dish.dish_type.toLocaleLowerCase('de')
  if (/fisch/.test(type)) return 'fish'
  if (/fleisch(?!los)/.test(type)) return 'meat'
  return undefined
}

export function dishEmoji(dish: Pick<Dish, 'name' | 'dish_type' | 'labels'>): string {
  const vegetarian = dish.labels.includes('VEGAN') || dish.labels.includes('VEGETARIAN')
  const fromName = bestNameMatch(dish.name, vegetarian ? PLANT_RULES : RULES)?.emoji
  if (fromName) return fromName

  const type = dish.dish_type.toLocaleLowerCase('de')
  const fromType = DISH_TYPE_RULES.find(([pattern]) => pattern.test(type))?.[1]
  if (fromType) return fromType

  if (dish.labels.includes('VEGAN')) return '🌱'
  if (dish.labels.includes('VEGETARIAN')) return '🥦'
  if (dish.labels.includes('FISH')) return '🐟'
  if (dish.labels.includes('MEAT')) return '🍖'
  return '🍽️'
}
