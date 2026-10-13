# Munich Mensa

A cross-platform [Tauri v2](https://v2.tauri.app) app that shows every Studierendenwerk mensa, StuBistro and StuCafé in and around Munich on a map. It includes the week's menus, prices and opening hours.

- **Map** of all locations within 45 km of Marienplatz, which covers Garching, Freising/Weihenstephan and Martinsried. It uses a minimal vector basemap (MapLibre GL). Pins are colour-coded by type and carry an open/closed dot.
- **Touchpad gestures**: pinch zooms the map around your fingers, never the whole UI. Two-finger scrolling pans the map, and a mouse wheel zooms.
- **Weekly menus.** Pick any weekday of this week or the next two. Dishes are grouped by counter and each gets a fitting emoji. They show vegan/veggie/meat/fish badges, prices for students, staff or guests, and allergens (tap a dish).
- **Opening hours** with a live "open until …" or "opens at …" status in Munich time.
- **Search** across location names *and* the selected day's dishes ("curry", "Schnitzel" …), plus filters for type, diet and "still open".
- **German / English** and a responsive layout: a sidebar on desktop and a bottom sheet on phones.
- **Light / dark** follows the system by default. The sun/moon button overrides it, and switching back to what the system shows returns to following it.
- **Works offline.** Menus and map tiles are cached on disk by the Rust side.

## Data

| What | Source |
| --- | --- |
| Menus, locations | [TUM-Dev eat-api](https://github.com/TUM-Dev/eat-api) (`https://tum-dev.github.io/eat-api/`), with English translations and prices |
| Missing menus | The Studierendenwerk's own menu pages, `speiseplan_<id>_-de.html` (German only), scraped by `src-tauri/src/swm.rs` |
| Missing locations, current hours | [Studierendenwerk location pages](https://www.studierendenwerk-muenchen-oberbayern.de/gastronomie/standorte-und-oeffnungszeiten/), curated in `src/lib/locations.ts` |
| Map | [OpenFreeMap](https://openfreemap.org) vector tiles (OpenMapTiles schema, © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors). It uses the "Positron" style, and the "Dark" style recoloured to a softer slate palette (`src/lib/mapTheme.ts`). |

eat-api misses several Studierendenwerk locations, among them StuBistro Oettingenstraße (LMU computer science), Akademiestraße, Bernd-Eichinger-Platz, Oberschleißheim, Mensa Ottobrunn-Taufkirchen and the StuCafés at Leopoldstraße, Arcisstraße 21 and Lothstraße. It also still uses old menu page numbers for places the Studierendenwerk renamed: "StuCafé Adalbertstraße" is now *StuBistro Adalbertstraße* (the bistro in the LMU main building), alongside Karlstraße and the two Weihenstephan bistros. There is no other public API covering these; OpenMensa's Munich feeds are dead.

So `src/lib/locations.ts` corrects and extends eat-api's list with names, addresses, coordinates (geocoded via OpenStreetMap Nominatim), opening hours and menu page numbers. They are taken from the Studierendenwerk's site and dated in the file, so they need an occasional refresh. For menus, eat-api is asked first because it has English names. When it has nothing for a week, the app scrapes the Studierendenwerk page and derives labels and prices with eat-api's rules. Coffee-only places (StuLounges, espresso bars) are not included.

Mediziner Mensa and FMI Bistro are not run by the Studierendenwerk and have no menu. Opening hours are the regular lecture-period hours. They don't reflect public holidays or semester breaks.

## Architecture

```
src/                     Svelte 5 + TypeScript frontend (Vite)
  App.svelte             layout, header, sidebar / bottom sheet
  lib/store.svelte.ts    app state (runes), menu loading, filtering
  lib/MapView.svelte     MapLibre map and markers
  lib/mapSetup.ts        MapLibre worker + `ofm://` protocol that routes map requests to Rust
  lib/mapGestures.ts     touchpad pinch / two-finger pan handling
  lib/mapTheme.ts        lifts OpenFreeMap's near-black dark style to a softer palette
  lib/dishEmoji.ts       emoji per dish from its German/English name, counter and labels
  lib/locations.ts       Studierendenwerk locations missing from / outdated in eat-api
  lib/time.ts            ISO weeks and opening-hours logic in Europe/Berlin time
src-tauri/src/
  eat_api.rs             `eat_api_get` command: eat-api JSON
  swm.rs                 `swm_menu` command: parses Studierendenwerk menu pages
  cache.rs               JSON disk cache with stale-on-error fallback
  map_data.rs            `map_resource` command: OpenFreeMap proxy with disk cache
  gestures.rs            Linux: takes touchpad pinches away from WebKitGTK page zoom
  http.rs                shared reqwest client (rustls, works on desktop and mobile)
```

The frontend calls `invoke('eat_api_get', { path, maxAgeSecs })`. Rust serves fresh responses from the cache and otherwise downloads them. If the network is down, it falls back to the last cached copy, and the UI shows an "offline" banner.

The map uses MapLibre GL with OpenFreeMap's minimal styles. In the app, every map request (style, TileJSON, vector tiles, fonts, sprites) goes through the `ofm://` protocol in `mapSetup.ts` to the `map_resource` command. Rust fetches only from `tiles.openfreemap.org` and caches on disk. Styles and TileJSON are refreshed daily. Versioned tiles, fonts and sprites are kept for 30 days and then pruned at startup. Areas you have viewed keep working offline. A custom URI scheme isn't used because WebKitGTK blocks custom-scheme subresources on pages served over `http://`, which is how `tauri dev` serves the app.

**Touchpad gestures on Linux.** WebKitGTK handles a touchpad pinch by magnifying the whole page with a GtkGestureZoom, so the page never sees it. `gestures.rs` stops those GDK events at the web view's `event` signal, which runs before that gesture, and emits them as `touchpad-pinch` events. `mapGestures.ts` then zooms the map around the pinch centre, and ignores pinches that start outside the map. Two-finger scrolling over the map pans it. The code tells touchpads from mouse wheels by WebKitGTK's ratio of the legacy `wheelDelta` to `deltaY`: 3 for touchpads and below 2 for wheels. macOS pinches are handled through Safari's `gesture*` events. On Windows, Chromium sends pinches as Ctrl+wheel, which MapLibre already handles.

Running `npm run dev` in a plain browser also works. `api.ts` and `mapSetup.ts` then fetch eat-api and OpenFreeMap directly, without the cache.

## Development

Prerequisites: Node ≥ 22, Rust ≥ 1.90 and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) (on Linux: `webkit2gtk-4.1`).

```sh
npm install
npm run tauri dev            # desktop app with hot reload
npm run tauri build          # release bundles (deb/rpm/AppImage, msi, dmg … per host OS)

npm test                     # frontend unit tests (node:test)
npm run check                # svelte-check + tsc
cd src-tauri && cargo test   # Rust unit tests
```

### Mobile

The crate already has the `mobile_entry_point`, and the UI is touch-friendly. With the Android SDK/NDK or Xcode installed:

```sh
npm run tauri android init && npm run tauri android dev
npm run tauri ios init && npm run tauri ios dev       # macOS only
```

App icons for all platforms are generated from `app-icon.svg` with `npm run tauri icon app-icon.svg`.
