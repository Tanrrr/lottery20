import { describe, it, expect } from 'vitest'
import { randomOrder, weightedOrder, toRevealSequence } from './lottery'

describe('randomOrder', () => {
  it('returns every team exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const order = randomOrder(ids)
    expect(order).toHaveLength(6)
    expect(new Set(order)).toEqual(new Set(ids))
  })

  it('does not mutate the input array', () => {
    const ids = ['a', 'b', 'c']
    const copy = [...ids]
    randomOrder(ids)
    expect(ids).toEqual(copy)
  })
})

describe('weightedOrder', () => {
  it('returns every team exactly once', () => {
    const teams = [
      { id: 'a', weight: 10 },
      { id: 'b', weight: 5 },
      { id: 'c', weight: 1 },
    ]
    const order = weightedOrder(teams)
    expect(order).toHaveLength(3)
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('gives higher-weighted teams the top slot more often than lower-weighted teams', () => {
    const teams = [
      { id: 'heavy', weight: 90 },
      { id: 'light', weight: 10 },
    ]
    let heavyWonSlot1 = 0
    const trials = 2000
    for (let i = 0; i < trials; i++) {
      if (weightedOrder(teams)[0] === 'heavy') heavyWonSlot1++
    }
    // Expected ~90%; assert it's clearly weighted, not 50/50, with tolerance for randomness.
    expect(heavyWonSlot1 / trials).toBeGreaterThan(0.75)
  })

  it('does not mutate the input array', () => {
    const teams = [{ id: 'a', weight: 5 }, { id: 'b', weight: 5 }]
    const copy = teams.map((t) => ({ ...t }))
    weightedOrder(teams)
    expect(teams).toEqual(copy)
  })
})

describe('toRevealSequence', () => {
  it('reverses the slot order', () => {
    expect(toRevealSequence(['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
  })

  it('does not mutate the input array', () => {
    const slotOrder = ['a', 'b', 'c']
    const copy = [...slotOrder]
    toRevealSequence(slotOrder)
    expect(slotOrder).toEqual(copy)
  })
})
