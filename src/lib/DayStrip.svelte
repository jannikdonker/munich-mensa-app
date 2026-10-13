<script lang="ts">
  import { formatDay, t, weekdayName } from './i18n'
  import Icon from './Icon.svelte'
  import { app } from './store.svelte'
  import { weekdayIndex } from './time'
</script>

<nav class="strip" aria-label={t(app.lang, 'week', { n: app.week.week })}>
  <button
    class="arrow"
    disabled={!app.canGoBack}
    onclick={() => app.shiftWeek(-1)}
    title={t(app.lang, 'prevWeek')}
    aria-label={t(app.lang, 'prevWeek')}
  >
    <Icon name="back" />
  </button>
  <span class="week">{t(app.lang, 'week', { n: app.week.week })}</span>
  <div class="days">
    {#each app.weekdays as date (date)}
      {@const isToday = date === app.now.date}
      <button
        class="day"
        class:active={date === app.date}
        class:today={isToday}
        class:past={date < app.now.date}
        aria-pressed={date === app.date}
        title={formatDay(app.lang, date, 'long')}
        onclick={() => (app.date = date)}
      >
        <span class="name">{isToday ? t(app.lang, 'today') : weekdayName(app.lang, weekdayIndex(date), 'short')}</span>
        <span class="date">{formatDay(app.lang, date).replace(/^\D+/, '')}</span>
      </button>
    {/each}
  </div>
  <button
    class="arrow"
    disabled={!app.canGoForward}
    onclick={() => app.shiftWeek(1)}
    title={t(app.lang, 'nextWeek')}
    aria-label={t(app.lang, 'nextWeek')}
  >
    <Icon name="forward" />
  </button>
</nav>

<style>
  .strip {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }
  .week {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-2);
    white-space: nowrap;
    padding: 0 0.25rem;
  }
  .days {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .arrow {
    flex: none;
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-1);
  }
  .arrow:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .arrow:disabled {
    opacity: 0.3;
  }
  .day {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 3.4rem;
    padding: 0.3rem 0.5rem;
    border-radius: 0.6rem;
    line-height: 1.15;
    color: var(--text-1);
  }
  .day:hover {
    background: var(--surface-2);
  }
  .day.past:not(.active) {
    color: var(--text-3);
  }
  .day.today .name {
    color: var(--accent);
  }
  .day.active {
    background: var(--accent);
    color: var(--on-accent);
  }
  .day.active.today .name {
    color: inherit;
  }
  .name {
    font-size: 0.8rem;
    font-weight: 700;
  }
  .date {
    font-size: 0.72rem;
    opacity: 0.8;
  }

  @media (max-width: 760px) {
    .strip {
      width: 100%;
    }
    .week {
      display: none;
    }
    .days {
      flex: 1;
    }
    .day {
      flex: 1 1 0;
      min-width: 0;
      padding: 0.3rem 0.15rem;
    }
  }
</style>
