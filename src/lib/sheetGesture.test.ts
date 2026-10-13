import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releaseExpanded } from './sheetGesture.ts'

test('a long enough swipe moves the sheet to its other position', () => {
  assert.equal(releaseExpanded(false, -120, 0), true)
  assert.equal(releaseExpanded(true, 120, 0), false)
})

test('a short swipe snaps back', () => {
  assert.equal(releaseExpanded(false, -30, 0), false)
  assert.equal(releaseExpanded(true, 30, 0), true)
})

test('a flick wins over the distance', () => {
  assert.equal(releaseExpanded(false, -20, -0.8), true)
  assert.equal(releaseExpanded(true, 20, 0.8), false)
  // Dragged far, then flicked back.
  assert.equal(releaseExpanded(false, -200, 0.8), false)
  assert.equal(releaseExpanded(true, 200, -0.8), true)
})

test('swiping away from the other position keeps the sheet where it is', () => {
  assert.equal(releaseExpanded(false, 200, 0.8), false)
  assert.equal(releaseExpanded(true, -200, -0.8), true)
})
