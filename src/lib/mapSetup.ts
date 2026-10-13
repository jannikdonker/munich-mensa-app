import { isTauri } from '@tauri-apps/api/core'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { fetchMapResource } from './api'

// OpenFreeMap: free OpenStreetMap vector tiles, no API key (https://openfreemap.org).
const ORIGIN = 'https://tiles.openfreemap.org/'
// Inside Tauri, every map request goes through this protocol to the caching Rust side.
const PROTOCOL = 'ofm'
const PROXIED_ORIGIN = `${PROTOCOL}://tiles.openfreemap.org/`

let initialized = false

export function setupMapLibre() {
  if (initialized) return
  initialized = true
  // MapLibre only locates its worker by itself on http(s) pages, not on tauri://.
  maplibregl.setWorkerUrl(workerUrl)
  if (!isTauri()) return

  const decoder = new TextDecoder()
  maplibregl.addProtocol(PROTOCOL, async (request) => {
    // Glyph URLs contain raw font names ("Noto Sans Regular"); normalise the escaping.
    const url = encodeURI(decodeURI(request.url.replace(PROXIED_ORIGIN, ORIGIN)))
    const bytes = await fetchMapResource(url)
    if (request.type === 'json' || request.type === 'string') {
      // Styles and TileJSON link to further resources; keep those on the proxy too.
      const text = decoder.decode(bytes).replaceAll(ORIGIN, PROXIED_ORIGIN)
      return { data: request.type === 'json' ? JSON.parse(text) : text }
    }
    return { data: bytes }
  })
}

/** Minimal light/dark basemap styles. */
export function styleUrl(dark: boolean): string {
  return `${isTauri() ? PROXIED_ORIGIN : ORIGIN}styles/${dark ? 'dark' : 'positron'}`
}
