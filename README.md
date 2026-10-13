# Munich Mensa

A cross-platform [Tauri v2](https://v2.tauri.app) app that shows every Studierendenwerk mensa, StuBistro and StuCafé in and around Munich on a map. It includes the week's menus, prices and opening hours.

- **Map** of all locations within 45 km of Marienplatz, which covers Garching, Freising/Weihenstephan and Martinsried. It uses a minimal vector basemap (MapLibre GL). Pins are colour-coded by type and carry an open/closed dot.
- **Touchpad gestures**: pinch zooms the map around your fingers, never the whole UI. Two-finger scrolling pans the map, and a mouse wheel zooms.
- **Weekly menus.** Pick any weekday of this week or the next two. Dishes are grouped by counter and each gets a fitting emoji. They show vegan/veggie/meat/fish badges, prices for students, staff or guests, and allergens (tap a dish).
- **Opening hours** with a live "open until …" or "opens at …" status in Munich time.
- **Search** across location names *and* the selected day's dishes ("curry", "Schnitzel" …), plus filters for type, diet and "still open".
- **Favourites.** Star a location in the list or its details. Favourites come first in the list, carry a star on the map and have their own filter. They are saved on the device.
- **German / English** and a responsive layout: a sidebar on desktop and a bottom sheet on phones that you swipe up and down.
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

So `src/lib/locations.ts` corrects and extends eat-api's list with names, addresses, coordinates (geocoded via OpenStreetMap Nominatim), opening hours and menu page numbers. They are taken from the Studierendenwerk's site and dated in the file, so they need an occasional refresh. For menus, eat-api is asked first because it has English names. When it has nothing for a week, the app scrapes the Studierendenwerk page and derives labels and prices with eat-api's rules. The scraper reads the page in document order with fallbacks for where dates, codes and diets appear, so small markup changes don't break it. If a page has dishes it can't date or name, the scraper reports an error rather than an empty menu, and the last good copy stays in use. Coffee-only places (StuLounges, espresso bars) are not included.

Mediziner Mensa and FMI Bistro are not run by the Studierendenwerk and have no menu. Opening hours are the regular lecture-period hours. They don't reflect public holidays or semester breaks.

## Architecture

```
src/                     Svelte 5 + TypeScript frontend (Vite)
  App.svelte             layout, header, sidebar / bottom sheet
  lib/store.svelte.ts    app state (runes), menu loading, filtering
  lib/MapView.svelte     MapLibre map and markers
  lib/mapSetup.ts        MapLibre worker + `ofm://` protocol that routes map requests to Rust
  lib/mapGestures.ts     touchpad pinch / two-finger pan handling
  lib/sheetGesture.ts    swiping the bottom sheet on phones
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

Prerequisites:
- **Node `^20.19` or `≥ 22.12`** (Vite 8 requirement; `.npmrc` makes `npm install` fail fast on older versions). On Windows on ARM, use the native **ARM64** Node build.
- **Rust ≥ 1.90**
- The [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/). On Linux that's `webkit2gtk-4.1`. On Windows it's the Visual Studio Build Tools with "Desktop development with C++" (on ARM devices also the *MSVC ARM64 build tools*) and WebView2, which ships with Windows 11.

If `npm run dev` fails with *"Cannot find native binding"*, check `node -v` and `node -p process.arch`, then delete `node_modules` and run `npm install` again. On Windows the app uses the system TLS (SChannel) instead of rustls, so no extra C toolchain such as clang is needed on ARM64.

```sh
npm install
npm run tauri dev            # desktop app with hot reload
npm run tauri build          # release bundles (deb/rpm/AppImage, msi, dmg … per host OS)

npm test                     # frontend unit tests (node:test)
npm run check                # svelte-check + tsc
cd src-tauri && cargo test   # Rust unit tests
```

### Mobile

The crate has the `mobile_entry_point`, and on phones the sidebar becomes a bottom sheet that you swipe or tap open. The iOS project is checked in under `src-tauri/gen/apple`. Android isn't set up yet, so run `npm run tauri android init` once to generate `src-tauri/gen/android`.

Flags for the Tauri CLI go after `--`, so that npm passes them on instead of reading them itself.

#### iOS (macOS only)

Prerequisites:
- **Xcode**, signed in with your Apple ID under *Xcode → Settings → Accounts*.
- **CocoaPods**: `brew install cocoapods`.
- **Rust targets**: `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`.
- **Signing team.** Set `APPLE_DEVELOPMENT_TEAM` to your team ID, e.g. in your shell profile (`npm run tauri info` lists the teams of your signing certificates). Tauri writes it into `project.pbxproj` on every build; don't commit that change.
- **For an iPhone**: turn on *Settings → Privacy & Security → Developer Mode*, and connect it by cable once so Xcode can register it. In dev mode, the iPhone and the Mac must be on the same network.

Development, with hot reload for the frontend and rebuilds on Rust changes:

```sh
npm run tauri ios dev                     # asks for a simulator or a connected iPhone
npm run tauri ios dev "iPhone 17 Pro"     # runs on that simulator or device directly
npm run tauri ios dev -- --open           # opens Xcode instead, to run and debug from there
```

On an iPhone, the app loads the frontend from the Vite dev server on your Mac. The CLI sets `TAURI_DEV_HOST` to the Mac's network address, and `vite.config.ts` makes Vite listen there. To inspect the web view of a debug build, enable *Safari → Settings → Advanced → Show features for web developers*. Then open *Develop → (device) → Munich Mensa*.

To install a release build on your own iPhone, which then runs without the Mac:

```sh
npm run tauri ios run -- --release
```

With a free Apple ID (Personal Team), the app stops launching after 7 days and has to be installed again. With a paid Apple Developer Program membership, the signature lasts a year.

#### iOS release builds and distribution

`npm run tauri ios build` builds the IPA at `src-tauri/gen/apple/build/arm64/Munich Mensa.ipa`. The export method decides who can install it:

```sh
npm run tauri ios build                                        # "debugging" (default): development-signed, the team's registered devices
npm run tauri ios build -- --export-method release-testing     # ad hoc distribution to registered devices
npm run tauri ios build -- --export-method app-store-connect   # TestFlight and the App Store
```

TestFlight and the App Store need the paid Apple Developer Program and an app in [App Store Connect](https://appstoreconnect.apple.com) with the bundle ID `app.munichmensa`. Every upload needs a higher build number. Pass `--build-number <n>`, or set `bundle.iOS.bundleVersion` in `tauri.conf.json`. Upload the IPA with Apple's Transporter app or from the command line:

```sh
xcrun altool --upload-app --type ios --file "src-tauri/gen/apple/build/arm64/Munich Mensa.ipa" \
  --apiKey <key id> --apiIssuer <issuer id>     # key file: ~/.appstoreconnect/private_keys/AuthKey_<key id>.p8
```

Create the API key under *Users and Access → Integrations* in App Store Connect. After processing, the build shows up in TestFlight. From there it can be sent to testers or submitted for review.

The app's version comes from `version` in `tauri.conf.json`, so bump it there. Keep `package.json`, `src-tauri/Cargo.toml` and the checked-in `src-tauri/gen/apple/project.yml` and `Info.plist` in sync.

`Cargo.lock` pins `libc` to 0.2.189 because 0.2.190 breaks the iOS build. That release limits `mach_task_self` to macOS, and `num_threads` (pulled in by `time`) needs it. A plain `cargo update` undoes the pin. Restore it with `cargo update -p libc --precise 0.2.189` until a fix lands upstream.

#### Android

Prerequisites: Android Studio with the SDK, NDK and command-line tools. `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` must be set, and you need the Rust targets `aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`. See [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/#android).

```sh
npm run tauri android init      # once: generates src-tauri/gen/android
npm run tauri android dev       # emulator or USB-connected device, with hot reload
npm run tauri android build     # release APK and AAB under src-tauri/gen/android/app/build/outputs/
```

Release builds have to be signed before they can be installed or uploaded to Google Play. Set up a keystore as described in [Tauri's Android signing guide](https://v2.tauri.app/distribute/sign/android/).

App icons for all platforms are generated from `app-icon.svg`:

```sh
npm run tauri icon app-icon.svg -- --ios-color "#e8590c"
magick mogrify -background "#e8590c" -alpha remove -alpha off src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/*.png
```

iOS rounds the icon's corners itself, so `--ios-color` fills the transparent corners with the background orange. The command writes the iOS icons straight into the Xcode project. The `magick` step (ImageMagick) then drops their alpha channel, which the App Store rejects.
