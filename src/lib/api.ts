import { invoke, isTauri } from '@tauri-apps/api/core'
import { isoWeek } from './time'
import type { Canteen, DayMenu, Fetched, Label, Lang, WeekMenu } from './types'

const BASE_URL = 'https://tum-dev.github.io/eat-api/'

const HOUR = 60 * 60
const DAY = 24 * HOUR

async function get<T>(path: string, maxAgeSecs: number): Promise<Fetched<T>> {
  if (isTauri()) {
    // The Rust side caches responses on disk and falls back to them when offline.
    return invoke<Fetched<T>>('eat_api_get', { path, maxAgeSecs })
  }
  // Plain browser (`npm run dev` without Tauri): fetch directly, no cache.
  const response = await fetch(BASE_URL + path)
  const fetchedAt = Date.now() / 1000
  if (response.status === 404) return { data: null, fetchedAt, stale: false }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return { data: (await response.json()) as T, fetchedAt, stale: false }
}

export const fetchCanteens = () => get<Canteen[]>('enums/canteens.json', DAY)

export const fetchLabels = () => get<Label[]>('enums/labels.json', 7 * DAY)

export function fetchWeek(lang: Lang, canteenId: string, year: number, week: number) {
  const prefix = lang === 'en' ? 'en/' : ''
  const path = `${prefix}${canteenId}/${year}/${String(week).padStart(2, '0')}.json`
  return get<WeekMenu>(path, HOUR)
}

/**
 * The week's menu from the Studierendenwerk's own page (scraped by the Rust side). The
 * pages cover today and about two weeks ahead, in German only. Not available in a plain
 * browser, where the page cannot be fetched cross-origin.
 */
export async function fetchSwmWeek(swmId: number, year: number, week: number): Promise<Fetched<WeekMenu>> {
  if (!isTauri()) return { data: null, fetchedAt: Date.now() / 1000, stale: false }
  const result = await invoke<Fetched<{ days: DayMenu[] }>>('swm_menu', { id: swmId, maxAgeSecs: HOUR })
  const days = (result.data?.days ?? []).filter((day) => {
    const w = isoWeek(day.date)
    return w.year === year && w.week === week
  })
  return { ...result, data: days.length ? { number: week, year, days } : null }
}

export async function openExternal(url: string) {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

/** Raw bytes of an OpenFreeMap resource, downloaded and disk-cached by the Rust side. */
export async function fetchMapResource(url: string): Promise<ArrayBuffer> {
  // Raw IPC responses arrive as an ArrayBuffer, or as a number[] when Tauri falls back
  // to its postMessage transport (e.g. `tauri dev` on Linux).
  const data = await invoke<ArrayBuffer | number[]>('map_resource', { url })
  return data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer
}
