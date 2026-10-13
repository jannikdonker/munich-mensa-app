// Shapes of the TUM eat-api JSON (https://tum-dev.github.io/eat-api/).

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export interface OpenRange {
  start: string // "HH:MM"
  end: string
}

export interface Canteen {
  enum_name: string
  name: string
  canteen_id: string
  location: { address: string; latitude: number; longitude: number }
  queue_status: string | null
  open_hours: Partial<Record<DayKey, OpenRange>>
  // Added by locations.ts
  /** Studierendenwerk menu page number, used when eat-api has no menu. */
  swm_id?: number
  note?: { de: string; en: string }
  /** Whether eat-api knows this canteen. */
  eat_api?: boolean
}

export interface Price {
  base_price: number | null
  price_per_unit: number | null
  unit: string | null
}

export type PriceGroup = 'students' | 'staff' | 'guests'

export interface Dish {
  name: string
  prices: Partial<Record<PriceGroup, Price | null>>
  labels: string[]
  dish_type: string
}

export interface DayMenu {
  date: string // "YYYY-MM-DD"
  dishes: Dish[]
}

export interface WeekMenu {
  number: number
  year: number
  days: DayMenu[]
}

export interface Label {
  enum_name: string
  text: { DE: string; EN: string }
  abbreviation: string
}

export type Lang = 'de' | 'en'

export type Kind = 'mensa' | 'bistro' | 'cafe'

export type Diet = 'all' | 'vegetarian' | 'vegan'

export interface Fetched<T> {
  data: T | null // null: eat-api has nothing published (404)
  fetchedAt: number // unix seconds
  stale: boolean // network failed, served from an expired cache entry
}
