import { fetchCanteens, fetchLabels, fetchSwmWeek, fetchWeek } from './api'
import { inMunichArea, kindOf, KINDS, matchesDiet } from './canteens'
import { withStudierendenwerkLocations } from './locations'
import {
  addDays,
  defaultDate,
  isOpenOn,
  isoWeek,
  mondayOf,
  munichNow,
  openState,
  type Now,
  type OpenState,
} from './time'
import type { Canteen, Diet, Dish, Kind, Label, Lang, PriceGroup, WeekMenu } from './types'

type MenuEntry =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; menu: WeekMenu | null; stale: boolean; fetchedAt: number; source: MenuSource }

/** eat-api, or the Studierendenwerk's own (German-only) menu page. */
export type MenuSource = 'eat-api' | 'swm'

/** Dishes of one canteen on one day; `none` means eat-api has no menu for that week. */
export type DayDishes =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'none' }
  | { status: 'ok'; dishes: Dish[]; total: number; source: MenuSource } // `dishes` respects the diet filter

export interface ListItem {
  canteen: Canteen
  kind: Kind
  state: OpenState
  day: DayDishes
  /** Dishes matching the search query. */
  matches: Dish[]
}

const WEEKS_AHEAD = 2

export type Theme = 'system' | 'light' | 'dark'

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

const STATE_RANK: Record<OpenState['kind'], number> = { open: 0, later: 1, day: 1, done: 2, closed: 3 }

function loadPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(`munich-mensa.${key}`)
    return allowed.includes(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

export function savePref(key: string, value: string) {
  try {
    localStorage.setItem(`munich-mensa.${key}`, value)
  } catch {
    // Storage unavailable: preferences just won't persist.
  }
}

function menuKey(lang: Lang, canteenId: string, year: number, week: number) {
  return `${lang}:${canteenId}:${year}-${week}`
}

/** eat-api first (it has English names); the Studierendenwerk page when it has nothing. */
async function loadMenu(lang: Lang, canteen: Canteen, year: number, week: number): Promise<MenuEntry> {
  const { swm_id: swmId } = canteen
  if (canteen.eat_api) {
    try {
      const { data, stale, fetchedAt } = await fetchWeek(lang, canteen.canteen_id, year, week)
      if (data || !swmId) return { status: 'ok', menu: data, stale, fetchedAt, source: 'eat-api' }
    } catch (error) {
      if (!swmId) throw error
    }
  }
  if (!swmId) return { status: 'ok', menu: null, stale: false, fetchedAt: Date.now() / 1000, source: 'eat-api' }
  const { data, stale, fetchedAt } = await fetchSwmWeek(swmId, year, week)
  return { status: 'ok', menu: data, stale, fetchedAt, source: 'swm' }
}

class AppState {
  lang = $state<Lang>(
    loadPref('lang', ['de', 'en'], navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'),
  )
  priceGroup = $state<PriceGroup>(loadPref('priceGroup', ['students', 'staff', 'guests'], 'students'))
  diet = $state<Diet>(loadPref('diet', ['all', 'vegetarian', 'vegan'], 'all'))
  theme = $state<Theme>(loadPref('theme', ['system', 'light', 'dark'], 'system'))
  systemDark = $state(darkQuery.matches)
  dark = $derived(this.theme === 'dark' || (this.theme === 'system' && this.systemDark))
  kinds = $state<Record<Kind, boolean>>({ mensa: true, bistro: true, cafe: true })
  onlyOpen = $state(false)
  query = $state('')
  selectedId = $state<string | null>(null)

  now = $state<Now>(munichNow())
  date = $state<string>(defaultDate(munichNow().date))

  canteens = $state.raw<Canteen[]>([])
  canteensStatus = $state<'loading' | 'ok' | 'error'>('loading')
  canteensStaleAt = $state<number | null>(null)
  labels = $state.raw<Map<string, Label>>(new Map())
  menus = $state.raw<Record<string, MenuEntry>>({})

  selected = $derived(this.canteens.find((c) => c.canteen_id === this.selectedId) ?? null)
  week = $derived(isoWeek(this.date))
  monday = $derived(mondayOf(this.date))
  weekdays = $derived([0, 1, 2, 3, 4].map((i) => addDays(this.monday, i)))
  /** First selectable week: the current one, or next week on weekends. */
  firstMonday = $derived(mondayOf(defaultDate(this.now.date)))
  canGoBack = $derived(this.monday > this.firstMonday)
  canGoForward = $derived(this.monday < addDays(this.firstMonday, 7 * WEEKS_AHEAD))

  items = $derived.by(() => this.buildItems())

  /** Oldest download time among data shown from an expired cache, if any. */
  staleAt = $derived.by(() => {
    let oldest = this.canteensStaleAt
    for (const canteen of this.canteens) {
      const entry = this.menuEntry(canteen.canteen_id, this.date)
      if (entry?.status === 'ok' && entry.stale) oldest = Math.min(oldest ?? Infinity, entry.fetchedAt)
    }
    return oldest
  })

  constructor() {
    setInterval(() => (this.now = munichNow()), 30_000)
    darkQuery.addEventListener('change', (event) => (this.systemDark = event.matches))
  }

  async loadCanteens() {
    this.canteensStatus = 'loading'
    try {
      const result = await fetchCanteens()
      this.canteens = withStudierendenwerkLocations(result.data ?? []).filter(inMunichArea)
      this.canteensStaleAt = result.stale ? result.fetchedAt : null
      this.canteensStatus = 'ok'
    } catch (error) {
      console.error(error)
      this.canteensStatus = 'error'
    }
    fetchLabels()
      .then((result) => (this.labels = new Map((result.data ?? []).map((l) => [l.enum_name, l]))))
      .catch(console.error)
  }

  /** Loads the menus of all canteens for the week of `date`, skipping ones already loaded. */
  async loadWeek(lang: Lang, date: string, retry = false) {
    const { year, week } = isoWeek(date)
    const todo = this.canteens.filter((c) => {
      const entry = this.menus[menuKey(lang, c.canteen_id, year, week)]
      return !entry || (retry && entry.status === 'error')
    })
    if (todo.length === 0) return
    const loading = Object.fromEntries(
      todo.map((c) => [menuKey(lang, c.canteen_id, year, week), { status: 'loading' } as const]),
    )
    this.menus = { ...this.menus, ...loading }

    await Promise.all(
      todo.map(async (canteen) => {
        const key = menuKey(lang, canteen.canteen_id, year, week)
        let entry: MenuEntry
        try {
          entry = await loadMenu(lang, canteen, year, week)
        } catch (error) {
          entry = { status: 'error', message: String(error) }
        }
        this.menus = { ...this.menus, [key]: entry }
      }),
    )
  }

  menuEntry(canteenId: string, date: string): MenuEntry | undefined {
    const { year, week } = isoWeek(date)
    return this.menus[menuKey(this.lang, canteenId, year, week)]
  }

  dishesOn(canteenId: string, date: string): DayDishes {
    const entry = this.menuEntry(canteenId, date)
    if (!entry || entry.status === 'loading') return { status: 'loading' }
    if (entry.status === 'error') return entry
    if (!entry.menu) return { status: 'none' }
    const dishes = entry.menu.days.find((d) => d.date === date)?.dishes ?? []
    return {
      status: 'ok',
      dishes: dishes.filter((d) => matchesDiet(d, this.diet)),
      total: dishes.length,
      source: entry.source,
    }
  }

  stateOf(canteen: Canteen): OpenState {
    return openState(canteen, this.date, this.now)
  }

  /** Flips light/dark. Choosing what the OS shows anyway goes back to following the OS. */
  toggleTheme() {
    const dark = !this.dark
    this.theme = dark === this.systemDark ? 'system' : dark ? 'dark' : 'light'
  }

  shiftWeek(direction: -1 | 1) {
    const target = addDays(this.date, 7 * direction)
    // Coming back to the current week lands on today rather than a past weekday.
    this.date = mondayOf(target) === this.firstMonday ? defaultDate(this.now.date) : target
  }

  private buildItems(): ListItem[] {
    const query = this.query.trim().toLocaleLowerCase()
    const items: ListItem[] = []
    for (const canteen of this.canteens) {
      const kind = kindOf(canteen)
      if (!this.kinds[kind]) continue
      const state = this.stateOf(canteen)
      if (this.onlyOpen && !isOpenOn(state)) continue
      const day = this.dishesOn(canteen.canteen_id, this.date)

      let matches: Dish[] = []
      if (query) {
        const note = canteen.note ? `${canteen.note.de} ${canteen.note.en}` : ''
        const text = `${canteen.name} ${canteen.location.address} ${note}`.toLocaleLowerCase()
        if (day.status === 'ok') {
          matches = day.dishes.filter((d) => d.name.toLocaleLowerCase().includes(query))
        }
        if (!text.includes(query) && matches.length === 0) continue
      }
      items.push({ canteen, kind, state, day, matches })
    }
    return items.sort(
      (a, b) =>
        STATE_RANK[a.state.kind] - STATE_RANK[b.state.kind] ||
        KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
        a.canteen.name.localeCompare(b.canteen.name, this.lang),
    )
  }
}

export const app = new AppState()
