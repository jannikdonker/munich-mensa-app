<script lang="ts">
  import { KINDS } from './canteens'
  import { dishEmoji } from './dishEmoji'
  import { dietNames, formatDay, kindNames, t } from './i18n'
  import Icon from './Icon.svelte'
  import StatusPill from './StatusPill.svelte'
  import { app, type ListItem } from './store.svelte'
  import type { Diet } from './types'

  let { items, onselect }: { items: ListItem[]; onselect: (id: string) => void } = $props()

  const DIETS: Diet[] = ['all', 'vegetarian', 'vegan']

  const openLabel = $derived(
    app.date === app.now.date
      ? t(app.lang, 'openToday')
      : t(app.lang, 'openOnDay', { day: formatDay(app.lang, app.date) }),
  )

  function menuSummary(item: ListItem): string {
    switch (item.day.status) {
      case 'loading':
        return '…'
      case 'error':
      case 'none':
        return t(app.lang, 'noMenu')
      case 'ok': {
        const n = item.day.dishes.length
        if (item.day.total === 0) return t(app.lang, 'noMenu')
        return n === 1 ? t(app.lang, 'oneDish') : t(app.lang, 'dishes', { n })
      }
    }
  }
</script>

<div class="list-panel">
  <div class="filters">
    <label class="search">
      <Icon name="search" />
      <input
        type="search"
        placeholder={t(app.lang, 'searchPlaceholder')}
        bind:value={app.query}
        autocomplete="off"
        spellcheck="false"
      />
      {#if app.query}
        <button class="clear" aria-label="Clear" onclick={() => (app.query = '')}>
          <Icon name="close" size={16} />
        </button>
      {/if}
    </label>

    <div class="chips">
      {#each KINDS as kind (kind)}
        <button
          class="chip chip--{kind}"
          class:on={app.kinds[kind]}
          aria-pressed={app.kinds[kind]}
          onclick={() => (app.kinds[kind] = !app.kinds[kind])}
        >
          <Icon name={kind} size={15} />
          {kindNames[app.lang][kind]}
        </button>
      {/each}
      <button class="chip chip--open" class:on={app.onlyOpen} aria-pressed={app.onlyOpen} onclick={() => (app.onlyOpen = !app.onlyOpen)}>
        {openLabel}
      </button>
    </div>

    <div class="segmented" role="radiogroup" aria-label="Diet">
      {#each DIETS as diet (diet)}
        <button role="radio" aria-checked={app.diet === diet} class:on={app.diet === diet} onclick={() => (app.diet = diet)}>
          {dietNames[app.lang][diet]}
        </button>
      {/each}
    </div>
  </div>

  <ul class="items">
    {#each items as item (item.canteen.canteen_id)}
      <li>
        <button class="item" onclick={() => onselect(item.canteen.canteen_id)}>
          <span class="badge badge--{item.kind}"><Icon name={item.kind} size={18} /></span>
          <span class="main">
            <span class="name">{item.canteen.name}</span>
            <span class="address">
              {item.canteen.location.address}{#if item.canteen.note}<span class="note"> · {item.canteen.note[app.lang]}</span>{/if}
            </span>
            <span class="meta">
              <StatusPill state={item.state} />
              <span class="count">{menuSummary(item)}</span>
            </span>
            {#if item.matches.length}
              <span class="matches">
                {#each item.matches.slice(0, 3) as match, i (i)}
                  <span class="match"><span aria-hidden="true">{dishEmoji(match)}</span> {match.name}</span>
                {/each}
              </span>
            {/if}
          </span>
        </button>
      </li>
    {:else}
      <li class="empty">{t(app.lang, 'noResults')}</li>
    {/each}
    <li class="source">{t(app.lang, 'source')}</li>
  </ul>
</div>

<style>
  .list-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .filters {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: var(--surface-2);
    color: var(--text-2);
  }
  .search:focus-within {
    outline: 2px solid var(--accent);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    color: var(--text-1);
    font: inherit;
    outline: none;
  }
  .search input::-webkit-search-cancel-button {
    display: none;
  }
  .clear {
    display: grid;
    place-items: center;
    color: var(--text-2);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-2);
  }
  .chip.on {
    color: #fff;
    border-color: transparent;
  }
  .chip--mensa.on {
    background: var(--kind-mensa);
  }
  .chip--bistro.on {
    background: var(--kind-bistro);
  }
  .chip--cafe.on {
    background: var(--kind-cafe);
  }
  .chip--open.on {
    background: var(--open-solid);
  }
  .segmented {
    display: flex;
    padding: 3px;
    border-radius: 0.6rem;
    background: var(--surface-2);
  }
  .segmented button {
    flex: 1;
    padding: 0.3rem;
    border-radius: 0.45rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-2);
  }
  .segmented button.on {
    background: var(--surface);
    color: var(--text-1);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .item {
    width: 100%;
    display: flex;
    gap: 0.75rem;
    padding: 0.7rem 1rem;
    text-align: left;
    color: inherit;
  }
  .item:hover {
    background: var(--surface-2);
  }
  .badge {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
  }
  .badge--mensa {
    background: var(--kind-mensa);
  }
  .badge--bistro {
    background: var(--kind-bistro);
  }
  .badge--cafe {
    background: var(--kind-cafe);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .name {
    font-weight: 650;
  }
  .address {
    font-size: 0.8rem;
    color: var(--text-2);
  }
  .note {
    color: var(--accent);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }
  .count {
    font-size: 0.75rem;
    color: var(--text-2);
  }
  .matches {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin-top: 0.3rem;
  }
  .match {
    font-size: 0.78rem;
    color: var(--text-1);
    padding-left: 0.5rem;
    border-left: 2px solid var(--accent);
  }
  .source {
    padding: 1rem;
    font-size: 0.7rem;
    color: var(--text-3);
    text-align: center;
  }
  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-2);
  }
</style>
