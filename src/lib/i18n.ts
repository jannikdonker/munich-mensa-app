import type { Diet, Kind, Lang, PriceGroup } from './types'

const strings = {
  de: {
    searchPlaceholder: 'Mensa oder Gericht suchen …',
    openToday: 'Hat heute noch offen',
    openOnDay: 'Geöffnet am {day}',
    openUntil: 'Geöffnet bis {time}',
    opensAt: 'Öffnet um {time}',
    closedForToday: 'Für heute geschlossen',
    closed: 'Geschlossen',
    openingHours: 'Öffnungszeiten',
    hoursNote:
      'Regelzeiten laut eat-api. An Feiertagen und in der vorlesungsfreien Zeit kann es abweichen.',
    menu: 'Speiseplan',
    noMenuPublished: 'Für diese Woche ist (noch) kein Speiseplan veröffentlicht.',
    germanOnly: '',
    noDishesToday: 'An diesem Tag gibt es keinen Speiseplan.',
    noDietDishes: 'Keine passenden Gerichte für den Filter.',
    menuError: 'Speiseplan konnte nicht geladen werden.',
    loadError: 'Die Standorte konnten nicht geladen werden.',
    retry: 'Erneut versuchen',
    loading: 'Lade …',
    noResults: 'Keine Treffer.',
    dishes: '{n} Gerichte',
    oneDish: '1 Gericht',
    noMenu: 'Kein Speiseplan',
    back: 'Zurück',
    directions: 'Route',
    week: 'KW {n}',
    today: 'Heute',
    prevWeek: 'Vorherige Woche',
    nextWeek: 'Nächste Woche',
    offline: 'Offline – gespeicherte Daten vom {date}',
    allergens: 'Inhaltsstoffe & Allergene',
    showAll: 'Alle Standorte zeigen',
    language: 'Sprache',
    lightMode: 'Helles Design',
    darkMode: 'Dunkles Design',
    priceGroup: 'Preise für',
    source: 'Daten: TUM-Dev eat-api · Studierendenwerk München Oberbayern',
    expand: 'Liste ausklappen',
    collapse: 'Liste einklappen',
  },
  en: {
    searchPlaceholder: 'Search canteens or dishes …',
    openToday: 'Still open today',
    openOnDay: 'Open on {day}',
    openUntil: 'Open until {time}',
    opensAt: 'Opens at {time}',
    closedForToday: 'Closed for today',
    closed: 'Closed',
    openingHours: 'Opening hours',
    hoursNote: 'Regular hours from eat-api. They may differ on public holidays and during semester breaks.',
    menu: 'Menu',
    noMenuPublished: 'No menu has been published for this week (yet).',
    germanOnly: 'The Studierendenwerk publishes this menu in German only.',
    noDishesToday: 'There is no menu for this day.',
    noDietDishes: 'No dishes match the filter.',
    menuError: 'Could not load the menu.',
    loadError: 'Could not load the locations.',
    retry: 'Try again',
    loading: 'Loading …',
    noResults: 'No matches.',
    dishes: '{n} dishes',
    oneDish: '1 dish',
    noMenu: 'No menu',
    back: 'Back',
    directions: 'Directions',
    week: 'Week {n}',
    today: 'Today',
    prevWeek: 'Previous week',
    nextWeek: 'Next week',
    offline: 'Offline – saved data from {date}',
    allergens: 'Ingredients & allergens',
    showAll: 'Show all locations',
    language: 'Language',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    priceGroup: 'Prices for',
    source: 'Data: TUM-Dev eat-api · Studierendenwerk München Oberbayern',
    expand: 'Expand list',
    collapse: 'Collapse list',
  },
} satisfies Record<Lang, Record<string, string>>

export type StringKey = keyof (typeof strings)['de']

export function t(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  return strings[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
}

export const kindNames: Record<Lang, Record<Kind, string>> = {
  de: { mensa: 'Mensen', bistro: 'StuBistros', cafe: 'StuCafés' },
  en: { mensa: 'Mensas', bistro: 'StuBistros', cafe: 'StuCafés' },
}

export const kindName: Record<Kind, string> = { mensa: 'Mensa', bistro: 'StuBistro', cafe: 'StuCafé' }

export const dietNames: Record<Lang, Record<Diet, string>> = {
  de: { all: 'Alle', vegetarian: 'Vegetarisch', vegan: 'Vegan' },
  en: { all: 'All', vegetarian: 'Vegetarian', vegan: 'Vegan' },
}

export const priceGroupNames: Record<Lang, Record<PriceGroup, string>> = {
  de: { students: 'Studierende', staff: 'Bedienstete', guests: 'Gäste' },
  en: { students: 'Students', staff: 'Staff', guests: 'Guests' },
}

export function locale(lang: Lang): string {
  return lang === 'de' ? 'de-DE' : 'en-GB'
}

export function formatDay(lang: Lang, date: string, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale(lang), {
    weekday: style,
    day: 'numeric',
    month: style === 'short' ? 'numeric' : 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function weekdayName(lang: Lang, mondayIndex: number, style: 'short' | 'long' = 'long'): string {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(locale(lang), { weekday: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 1 + mondayIndex)),
  )
}
