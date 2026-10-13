<script lang="ts">
  import { openExternal } from './api'
  import { dietOf, directionsUrl, formatPrice, groupByType, kindOf } from './canteens'
  import { dishEmoji } from './dishEmoji'
  import { formatDay, kindName, priceGroupNames, t, weekdayName } from './i18n'
  import Icon from './Icon.svelte'
  import StatusPill from './StatusPill.svelte'
  import { app } from './store.svelte'
  import { DAY_KEYS, type Canteen, type Dish } from './types'
  import { dayKey } from './time'

  let { canteen, onclose }: { canteen: Canteen; onclose: () => void } = $props()

  const kind = $derived(kindOf(canteen))
  const favorite = $derived(app.isFavorite(canteen.canteen_id))
  const day = $derived(app.dishesOn(canteen.canteen_id, app.date))
  const selectedDayKey = $derived(dayKey(app.date))
  let expanded = $state<string | null>(null)

  // Diet labels are shown as badges; everything else goes into the expandable details.
  const DIET_LABELS = new Set(['VEGAN', 'VEGETARIAN', 'MEAT'])

  function labelText(name: string): string {
    const label = app.labels.get(name)
    return label ? label.text[app.lang === 'de' ? 'DE' : 'EN'] : name.toLowerCase().replace(/_/g, ' ')
  }

  function dishKey(dish: Dish, index: number) {
    return `${app.date}:${index}:${dish.name}`
  }

  const dietBadge: Record<string, { de: string; en: string }> = {
    vegan: { de: 'Vegan', en: 'Vegan' },
    vegetarian: { de: 'Veggie', en: 'Veggie' },
    fish: { de: 'Fisch', en: 'Fish' },
    meat: { de: 'Fleisch', en: 'Meat' },
  }
</script>

<article class="details">
  <header class="head">
    <button class="back" onclick={onclose} aria-label={t(app.lang, 'back')}>
      <Icon name="back" />
    </button>
    <span class="badge badge--{kind}"><Icon name={kind} size={20} /></span>
    <div class="title">
      <h2>{canteen.name}</h2>
      <p class="address">{canteen.location.address}</p>
      {#if canteen.note}
        <p class="note">{canteen.note[app.lang]}</p>
      {/if}
    </div>
    <button
      class="star"
      class:on={favorite}
      aria-pressed={favorite}
      aria-label={t(app.lang, favorite ? 'removeFavorite' : 'addFavorite')}
      title={t(app.lang, favorite ? 'removeFavorite' : 'addFavorite')}
      onclick={() => app.toggleFavorite(canteen.canteen_id)}
    >
      <Icon name="star" size={20} filled={favorite} />
    </button>
  </header>

  <div class="actions">
    <StatusPill state={app.stateOf(canteen)} />
    <span class="kind">{kindName[kind]}</span>
    <button class="route" onclick={() => openExternal(directionsUrl(canteen))}>
      <Icon name="route" size={15} />
      {t(app.lang, 'directions')}
    </button>
  </div>

  <div class="scroll">
    <section>
      <h3>{t(app.lang, 'menu')} · {formatDay(app.lang, app.date, 'long')}</h3>

      {#if day.status === 'loading'}
        <p class="note">{t(app.lang, 'loading')}</p>
      {:else if day.status === 'error'}
        <p class="note">{t(app.lang, 'menuError')}</p>
        <button class="retry" onclick={() => app.loadWeek(app.lang, app.date, true)}>{t(app.lang, 'retry')}</button>
      {:else if day.status === 'none'}
        <p class="note">{t(app.lang, 'noMenuPublished')}</p>
      {:else if day.total === 0}
        <p class="note">{t(app.lang, 'noDishesToday')}</p>
      {:else if day.dishes.length === 0}
        <p class="note">{t(app.lang, 'noDietDishes')}</p>
      {:else}
        {#if day.source === 'swm' && app.lang === 'en'}
          <p class="fine">{t(app.lang, 'germanOnly')}</p>
        {/if}
        {#each groupByType(day.dishes) as [type, dishes] (type)}
          <div class="group">
            <h4>{type}</h4>
            <ul>
              {#each dishes as dish, i (dishKey(dish, i))}
                {@const key = dishKey(dish, i)}
                {@const diet = dietOf(dish)}
                {@const price = formatPrice(dish.prices[app.priceGroup], app.lang)}
                {@const extra = dish.labels.filter((l) => !DIET_LABELS.has(l))}
                <li class="dish" class:open={expanded === key}>
                  <button class="dish-row" onclick={() => (expanded = expanded === key ? null : key)} aria-expanded={expanded === key}>
                    <span class="dish-emoji" aria-hidden="true">{dishEmoji(dish)}</span>
                    <span class="dish-name">{dish.name}</span>
                    <span class="dish-meta">
                      {#if diet}
                        <span class="diet diet--{diet}">{dietBadge[diet][app.lang]}</span>
                      {/if}
                      {#if price}
                        <span class="price" title={priceGroupNames[app.lang][app.priceGroup]}>{price}</span>
                      {/if}
                    </span>
                  </button>
                  {#if expanded === key && extra.length}
                    <div class="labels">
                      <span class="labels-title">{t(app.lang, 'allergens')}</span>
                      <ul>
                        {#each extra as label (label)}
                          <li>
                            <span class="abbr">{app.labels.get(label)?.abbreviation ?? '•'}</span>
                            {labelText(label)}
                          </li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
    </section>

    <section>
      <h3>{t(app.lang, 'openingHours')}</h3>
      <table class="hours">
        <tbody>
          {#each DAY_KEYS as key, i (key)}
            {@const range = canteen.open_hours[key]}
            <tr class:current={key === selectedDayKey} class:closed={!range}>
              <th scope="row">{weekdayName(app.lang, i)}</th>
              <td>{range ? `${range.start} – ${range.end}` : t(app.lang, 'closed')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="fine">{t(app.lang, 'hoursNote')}</p>
    </section>
  </div>
</article>

<style>
  .details {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.9rem 0.5rem 0.4rem;
  }
  .back {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-1);
  }
  .back:hover {
    background: var(--surface-2);
  }
  .badge {
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
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
  .title {
    flex: 1;
    min-width: 0;
  }
  .star {
    flex: none;
    align-self: flex-start;
    width: 2.25rem;
    height: 2.25rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-3);
  }
  .star:hover {
    color: var(--text-1);
    background: var(--surface-2);
  }
  .star.on {
    color: var(--favorite);
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.25;
  }
  .address {
    margin: 0.1rem 0 0;
    font-size: 0.85rem;
    color: var(--text-2);
  }
  .note {
    margin: 0.1rem 0 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 1rem 0.8rem 3.25rem;
    border-bottom: 1px solid var(--border);
  }
  .kind {
    font-size: 0.75rem;
    color: var(--text-2);
  }
  .route {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 1rem 1.5rem;
  }
  h3 {
    font-size: 0.95rem;
    margin: 1.1rem 0 0.5rem;
  }
  h4 {
    margin: 0.9rem 0 0.25rem;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-2);
  }
  .group ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .dish {
    border-radius: 0.6rem;
  }
  .dish.open {
    background: var(--surface-2);
  }
  .dish-row {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.5rem;
    border-radius: 0.6rem;
    text-align: left;
    color: inherit;
  }
  .dish-row:hover {
    background: var(--surface-2);
  }
  .dish-emoji {
    flex: none;
    width: 1.6rem;
    font-size: 1.15rem;
    line-height: 1.3;
    text-align: center;
  }
  .dish-name {
    flex: 1;
    font-size: 0.92rem;
    line-height: 1.35;
  }
  .dish-meta {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
  }
  .price {
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .diet {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.1em 0.5em;
    border-radius: 999px;
  }
  .diet--vegan {
    background: var(--vegan-bg);
    color: var(--vegan);
  }
  .diet--vegetarian {
    background: var(--veggie-bg);
    color: var(--veggie);
  }
  .diet--fish {
    background: var(--fish-bg);
    color: var(--fish);
  }
  .diet--meat {
    background: var(--meat-bg);
    color: var(--meat);
  }
  .labels {
    padding: 0 0.5rem 0.6rem;
  }
  .labels-title {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-2);
  }
  .labels ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.3rem;
  }
  .labels li {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .abbr {
    font-size: 0.7rem;
    color: var(--text-2);
  }
  .hours {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }
  .hours th {
    text-align: left;
    font-weight: 500;
  }
  .hours td {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .hours th,
  .hours td {
    padding: 0.3rem 0.5rem;
  }
  .hours tr.closed {
    color: var(--text-3);
  }
  .hours tr.current {
    background: var(--surface-2);
    font-weight: 700;
  }
  .hours tr.current th {
    border-radius: 0.5rem 0 0 0.5rem;
  }
  .hours tr.current td {
    border-radius: 0 0.5rem 0.5rem 0;
  }
  .note {
    color: var(--text-2);
    font-size: 0.9rem;
  }
  .fine {
    font-size: 0.75rem;
    color: var(--text-3);
    margin-top: 0.5rem;
  }
  .retry {
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--text-1);
  }
</style>
