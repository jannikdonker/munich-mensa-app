import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dishEmoji } from './dishEmoji.ts'

const emoji = (name: string, labels: string[] = [], dish_type = 'Gericht 1') => dishEmoji({ name, dish_type, labels })

test('the head of a German compound decides', () => {
  assert.equal(emoji('Kartoffelsuppe'), '🍲')
  assert.equal(emoji('Blumenkohl-Kartoffel-Curry'), '🍛')
  assert.equal(emoji('Kürbisfalafel mit Paprika-Hummus'), '🧆')
  assert.equal(emoji('Gemüsemaultaschen mit frischem Gemüse'), '🥟')
  assert.equal(emoji('Schupfnudelpfanne mit frischem Gemüse'), '🥘')
  assert.equal(emoji('Blumenkohl-Kartoffel - Curry'), '🍛') // spacing as on the Studierendenwerk site
})

test('only the part before "mit"/"with" counts when it matches', () => {
  assert.equal(emoji('Pasta mit Räucherlachs und Spinat in Sahnesauce'), '🍝')
  assert.equal(emoji('Milchreis mit Zimt-Zucker und Kirschragout'), '🍮')
  assert.equal(emoji('Currywurst mit Honig-Ingwer-Ketchup (1 Stück)'), '🌭')
  assert.equal(emoji('Pasta with smoked salmon and spinach in a cream sauce'), '🍝')
})

test('specific meat beats generic cuts', () => {
  assert.equal(emoji('Hähnchenschnitzel mit Kürbiskernpanade (1 Stück)'), '🍗')
  assert.equal(emoji('Gegrilltes Seelachsfilet (1 Stück) mit Dillrahmsauce'), '🐟')
  assert.equal(emoji('Schweinebraten (1 Scheibe) mit Biersauce'), '🍖')
  assert.equal(emoji('Pork steak (1 piece) with green pepper sauce'), '🍖')
  assert.equal(emoji('Ein halbes Hendl (1 Stück)'), '🍗')
})

test('false friends', () => {
  assert.equal(emoji('Mariniertes Schweinelachssteak (1 Stück)'), '🍖') // pork loin, not salmon
  assert.equal(emoji('Fleischpflanzerl (1 Stück) mit BBQ-Dip'), '🍖') // not a flan
  assert.equal(emoji('Kleine Dampfnudel mit Vanillesauce'), '🥟') // not pasta
  assert.equal(emoji('Schweineschnitzel Wiener Art (1 Stück)'), '🍖') // not a sausage
  assert.equal(emoji('Pan-Fried Zander Filets (2 pieces)'), '🐟') // not a pan dish
  assert.equal(emoji('Saithe (2 pieces) in batter with remoulade sauce'), '🐟') // "pieces" is no pie
  assert.equal(emoji('Creamed pork with paprika'), '🍖') // not a dessert
  assert.equal(emoji('Strawberry Roll in a Glass'), '🍓')
})

test('meat words are ignored for vegetarian dishes', () => {
  assert.equal(emoji('Tofugeschnetzeltes asiatische Art', ['VEGAN']), '🥢')
  assert.equal(emoji('Vegetable meatball', ['VEGETARIAN']), '🥦')
  assert.equal(emoji('Vegane Gemüse-Bratwurst mit Wedges', ['VEGAN']), '🌭')
})

test('English names', () => {
  assert.equal(emoji('Cauliflower and potato curry'), '🍛')
  assert.equal(emoji('Chicken Skewer (1 piece) Hawaiian Style'), '🍢')
  assert.equal(emoji('Asian rice balls on teriyaki vegetables'), '🍙')
  assert.equal(emoji('Sweet potato casserole with chickpeas and chive dip'), '🥘')
  assert.equal(emoji('Allgäu cheese spaetzle with fried onions'), '🍝')
  assert.equal(emoji('Murgh Makhani - Butter Chicken with Basmati Rice'), '🍛')
})

test('falls back to the counter, then the diet', () => {
  assert.equal(emoji('Tagesdessert', [], 'Dessert (Glas)'), '🍮')
  assert.equal(emoji('Schnittlauchdip', [], 'Vegetarisch/fleischlos'), '🍽️')
  assert.equal(emoji('Schnittlauchdip', ['VEGETARIAN'], 'Vegetarisch/fleischlos'), '🥦')
  assert.equal(emoji('Geheimrezept', ['MEAT'], 'Gericht 2'), '🍖')
})
