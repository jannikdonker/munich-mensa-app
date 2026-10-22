import { animalIn } from './dishEmoji'
import { locale } from './i18n'
import type { Canteen, Diet, Dish, Kind, Lang, Price } from './types'

const MARIENPLATZ = { latitude: 48.1374, longitude: 11.5755 }

/** eat-api also lists Rosenheim, Straubing and Heilbronn; this keeps Munich incl. Garching, Freising and Martinsried. */
const MUNICH_AREA_RADIUS_KM = 45

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function inMunichArea(canteen: Canteen): boolean {
  return distanceKm(canteen.location, MARIENPLATZ) <= MUNICH_AREA_RADIUS_KM
}

export function isCentral(canteen: Canteen): boolean {
  return distanceKm(canteen.location, MARIENPLATZ) <= 12
}

// Go by the display name: e.g. `stucafe-garching` is named "StuBistro Garching".
export function kindOf(canteen: Canteen): Kind {
  if (/^stucaf/i.test(canteen.name)) return 'cafe'
  if (/bistro/i.test(canteen.name)) return 'bistro'
  return 'mensa'
}

export const KINDS: Kind[] = ['mensa', 'bistro', 'cafe']

export function matchesDiet(dish: Dish, diet: Diet): boolean {
  if (diet === 'vegan') return dish.labels.includes('VEGAN')
  if (diet === 'vegetarian') return dish.labels.includes('VEGETARIAN') || dish.labels.includes('VEGAN')
  return true
}

export function dietOf(dish: Dish): 'vegan' | 'vegetarian' | 'fish' | 'meat' | null {
  const l = dish.labels
  if (l.includes('VEGAN')) return 'vegan'
  if (l.includes('VEGETARIAN')) return 'vegetarian'
  if (l.includes('FISH')) return 'fish'
  if (['PORK', 'BEEF', 'VEAL', 'POULTRY', 'LAMB', 'WILD_MEAT'].some((m) => l.includes(m))) return 'meat'
  // The Studierendenwerk only says whether a dish is meatless, and eat-api turns every "not
  // meatless" into MEAT, so cheese made with animal rennet (Bergkäse, Gorgonzola) or desserts
  // with gelatin get it too. Only believe it when the name or counter names an animal.
  if (l.includes('MEAT')) return animalIn(dish) ?? null
  return null
}

export function formatPrice(price: Price | null | undefined, lang: Lang): string | null {
  if (!price) return null
  const eur = new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'EUR' })
  const base = price.base_price ?? 0
  const perUnit = price.price_per_unit ?? 0
  const unit = price.unit ? ` / ${price.unit}` : ''
  if (base > 0 && perUnit > 0) return `${eur.format(base)} + ${eur.format(perUnit)}${unit}`
  if (perUnit > 0) return `${eur.format(perUnit)}${unit}`
  if (base > 0) return eur.format(base)
  return null
}

/** Groups dishes by `dish_type`, keeping the order in which types first appear. */
export function groupByType(dishes: Dish[]): [string, Dish[]][] {
  const groups = new Map<string, Dish[]>()
  for (const dish of dishes) {
    const group = groups.get(dish.dish_type)
    if (group) group.push(dish)
    else groups.set(dish.dish_type, [dish])
  }
  return [...groups]
}

/**
 * Horizontal pixel offsets for markers that share (nearly) the same spot, e.g. Mensa and
 * StuCafé Pasing, so neither hides the other at any zoom level.
 */
export function markerOffsets(canteens: Canteen[], spacingPx = 30): Map<string, number> {
  const offsets = new Map<string, number>()
  const clusters: Canteen[][] = []
  for (const canteen of canteens) {
    const cluster = clusters.find((c) => distanceKm(c[0].location, canteen.location) < 0.06)
    if (cluster) cluster.push(canteen)
    else clusters.push([canteen])
  }
  for (const cluster of clusters) {
    // West to east, so offsets never push neighbours across each other when zooming in.
    cluster.sort((a, b) => a.location.longitude - b.location.longitude)
    cluster.forEach((canteen, i) => {
      offsets.set(canteen.canteen_id, (i - (cluster.length - 1) / 2) * spacingPx)
    })
  }
  return offsets
}

export function directionsUrl(canteen: Canteen): string {
  const { latitude, longitude } = canteen.location
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
}
