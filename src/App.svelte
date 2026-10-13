<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { openExternal } from './lib/api'
  import CanteenDetails from './lib/CanteenDetails.svelte'
  import CanteenList from './lib/CanteenList.svelte'
  import DayStrip from './lib/DayStrip.svelte'
  import Icon from './lib/Icon.svelte'
  import MapView from './lib/MapView.svelte'
  import { locale, priceGroupNames, t } from './lib/i18n'
  import { attachSheetDrag } from './lib/sheetGesture'
  import { app, savePref } from './lib/store.svelte'
  import type { PriceGroup } from './lib/types'

  const PRICE_GROUPS: PriceGroup[] = ['students', 'staff', 'guests']

  let compact = $state(false)
  let panel = $state<HTMLElement>()
  let sheetExpanded = $state(false)
  let sheetHeight = $state(0)
  /** Height in px while the sheet follows a finger. */
  let dragHeight = $state<number | null>(null)

  $effect(() => {
    if (!compact || !panel) return
    return attachSheetDrag(panel, {
      expanded: () => sheetExpanded,
      ondrag: (height) => (dragHeight = height),
      onrelease: (expanded) => {
        dragHeight = null
        sheetExpanded = expanded
      },
    })
  })

  $effect(() => savePref('lang', app.lang))
  $effect(() => savePref('priceGroup', app.priceGroup))
  $effect(() => savePref('diet', app.diet))
  $effect(() => savePref('theme', app.theme))
  $effect(() => {
    document.documentElement.dataset.theme = app.dark ? 'dark' : 'light'
  })
  $effect(() => {
    document.documentElement.lang = app.lang
  })

  // Fetch the menus of every canteen for the shown week, for search and dish counts.
  $effect(() => {
    if (app.canteensStatus !== 'ok') return
    const { lang, date } = app
    untrack(() => app.loadWeek(lang, date))
  })

  function select(id: string) {
    app.selectedId = id
  }

  function closeDetails() {
    app.selectedId = null
  }

  onMount(() => {
    app.loadCanteens()

    const narrow = window.matchMedia('(max-width: 760px)')
    const onNarrow = () => (compact = narrow.matches)
    onNarrow()
    narrow.addEventListener('change', onNarrow)

    // Open web links (map attribution etc.) in the system browser, not inside the app.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="http"]') as HTMLAnchorElement | null
      if (!link) return
      event.preventDefault()
      openExternal(link.href)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && app.selectedId) closeDetails()
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      narrow.removeEventListener('change', onNarrow)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  })
</script>

<div class="app" class:compact>
  <header class="topbar">
    <div class="brand">
      <span class="logo"><Icon name="mensa" size={18} /></span>
      <span class="brand-name">Munich Mensa</span>
    </div>
    <div class="strip"><DayStrip /></div>
    <div class="settings">
      <select bind:value={app.priceGroup} aria-label={t(app.lang, 'priceGroup')} title={t(app.lang, 'priceGroup')}>
        {#each PRICE_GROUPS as group (group)}
          <option value={group}>{priceGroupNames[app.lang][group]}</option>
        {/each}
      </select>
      <button
        class="lang"
        aria-label={t(app.lang, 'language')}
        title={t(app.lang, 'language')}
        onclick={() => (app.lang = app.lang === 'de' ? 'en' : 'de')}
      >
        <span class:on={app.lang === 'de'}>DE</span><span class:on={app.lang === 'en'}>EN</span>
      </button>
      <button
        class="theme"
        title={t(app.lang, app.dark ? 'lightMode' : 'darkMode')}
        aria-label={t(app.lang, app.dark ? 'lightMode' : 'darkMode')}
        onclick={() => app.toggleTheme()}
      >
        <Icon name={app.dark ? 'sun' : 'moon'} size={16} />
      </button>
    </div>
  </header>

  <main class="body">
    <aside
      class="panel"
      class:expanded={sheetExpanded}
      class:dragging={dragHeight !== null}
      style:height={dragHeight === null ? undefined : `${dragHeight}px`}
      bind:this={panel}
      bind:clientHeight={sheetHeight}
    >
      {#if compact}
        <button
          class="handle"
          aria-label={t(app.lang, sheetExpanded ? 'collapse' : 'expand')}
          onclick={() => (sheetExpanded = !sheetExpanded)}
        >
          <span class="grip"></span>
        </button>
      {/if}

      {#if app.staleAt}
        <div class="banner">
          {t(app.lang, 'offline', {
            date: new Date(app.staleAt * 1000).toLocaleString(locale(app.lang), {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
          })}
        </div>
      {/if}

      {#if app.canteensStatus === 'error'}
        <div class="state">
          <p>{t(app.lang, 'loadError')}</p>
          <button class="retry" onclick={() => app.loadCanteens()}>{t(app.lang, 'retry')}</button>
        </div>
      {:else if app.canteensStatus === 'loading' && app.canteens.length === 0}
        <div class="state"><p>{t(app.lang, 'loading')}</p></div>
      {:else}
        <!-- The list stays mounted so its scroll position and search survive a visit to the details. -->
        <div class="pane" hidden={!!app.selected}>
          <CanteenList items={app.items} onselect={select} />
        </div>
        {#if app.selected}
          <div class="pane">
            {#key app.selected.canteen_id}
              <CanteenDetails canteen={app.selected} onclose={closeDetails} />
            {/key}
          </div>
        {/if}
      {/if}
    </aside>

    <section class="map-area">
      <MapView items={app.items} bottomInset={compact ? sheetHeight : 0} onselect={select} />
    </section>
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    padding-top: max(0.5rem, env(safe-area-inset-top));
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: 1100;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 750;
    font-size: 1.05rem;
    white-space: nowrap;
  }
  .logo {
    width: 2rem;
    height: 2rem;
    border-radius: 0.6rem;
    display: grid;
    place-items: center;
    color: #fff;
    background: var(--kind-mensa);
  }
  .strip {
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: center;
  }
  .settings {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  select {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.35rem 0.5rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-1);
  }
  .lang {
    display: flex;
    padding: 3px;
    border-radius: 0.5rem;
    background: var(--surface-2);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .lang span {
    padding: 0.2rem 0.45rem;
    border-radius: 0.35rem;
    color: var(--text-2);
  }
  .theme {
    width: 2rem;
    height: 2rem;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 0.5rem;
    background: var(--surface-2);
    color: var(--text-1);
  }
  .theme:hover {
    color: var(--accent);
  }
  .lang span.on {
    background: var(--surface);
    color: var(--text-1);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;
  }
  .panel {
    width: 400px;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    z-index: 1050;
  }
  .pane {
    flex: 1;
    min-height: 0;
  }
  .pane[hidden] {
    display: none;
  }
  .map-area {
    flex: 1;
    min-width: 0;
  }
  .banner {
    padding: 0.4rem 1rem;
    font-size: 0.8rem;
    background: var(--later-bg);
    color: var(--later);
  }
  .state {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-2);
  }
  .retry {
    padding: 0.4rem 1rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--text-1);
  }

  /* Phones: map fills the screen, the panel becomes a bottom sheet. */
  .compact .topbar {
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
    padding: 0.4rem 0.75rem;
    padding-top: max(0.4rem, env(safe-area-inset-top));
  }
  .compact .brand-name {
    font-size: 0.95rem;
  }
  @media (max-width: 420px) {
    .brand-name {
      display: none;
    }
  }
  .compact .settings {
    margin-left: auto;
  }
  .compact .strip {
    order: 3;
    flex-basis: 100%;
    justify-content: flex-start;
  }
  .compact .map-area {
    position: absolute;
    inset: 0;
  }
  .compact .panel {
    --collapsed: 42%;
    --expanded: calc(100% - 2.5rem);
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: var(--collapsed);
    /* A drag sets any height; these keep it between the two positions. */
    min-height: var(--collapsed);
    max-height: var(--expanded);
    border-right: none;
    border-radius: 1rem 1rem 0 0;
    box-shadow: var(--shadow);
    padding-bottom: env(safe-area-inset-bottom);
    transition: height 0.25s ease;
  }
  .compact .panel.expanded {
    height: var(--expanded);
  }
  .compact .panel.dragging {
    transition: none;
  }
  .handle {
    flex: none;
    display: grid;
    place-items: center;
    height: 1.25rem;
    width: 100%;
  }
  .grip {
    width: 2.5rem;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }
</style>
