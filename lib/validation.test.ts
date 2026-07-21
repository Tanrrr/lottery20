import { describe, it, expect } from 'vitest'
import { createLeagueSchema, replaceTeamsSchema, validateTeamsForMode } from './validation'

describe('createLeagueSchema', () => {
  it('accepts a valid payload', () => {
    const result = createLeagueSchema.safeParse({ name: 'My League', mode: 'random' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = createLeagueSchema.safeParse({ name: '', mode: 'random' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid mode', () => {
    const result = createLeagueSchema.safeParse({ name: 'x', mode: 'weighted-ish' })
    expect(result.success).toBe(false)
  })
})

describe('replaceTeamsSchema', () => {
  it('rejects fewer than 6 teams', () => {
    const teams = Array.from({ length: 5 }, (_, i) => ({ name: `Team ${i}` }))
    const result = replaceTeamsSchema.safeParse({ teams })
    expect(result.success).toBe(false)
  })

  it('rejects more than 32 teams', () => {
    const teams = Array.from({ length: 33 }, (_, i) => ({ name: `Team ${i}` }))
    const result = replaceTeamsSchema.safeParse({ teams })
    expect(result.success).toBe(false)
  })

  it('accepts 6-32 teams with blank names rejected', () => {
    const teams = Array.from({ length: 6 }, (_, i) => ({ name: `Team ${i}` }))
    expect(replaceTeamsSchema.safeParse({ teams }).success).toBe(true)
    teams[0].name = ''
    expect(replaceTeamsSchema.safeParse({ teams }).success).toBe(false)
  })
})

describe('validateTeamsForMode', () => {
  const teams = [
    { name: 'A', weight: 5 },
    { name: 'B' }, // missing weight
  ]

  it('passes for random mode regardless of weights', () => {
    expect(validateTeamsForMode(teams, 'random').valid).toBe(true)
  })

  it('fails for weighted mode when any weight is missing', () => {
    expect(validateTeamsForMode(teams, 'weighted').valid).toBe(false)
  })

  it('fails for weighted mode when any weight is below the minimum', () => {
    const withZero = [{ name: 'A', weight: 0 }, { name: 'B', weight: 5 }]
    expect(validateTeamsForMode(withZero, 'weighted').valid).toBe(false)
  })

  it('passes for weighted mode when every weight is present and valid', () => {
    const valid = [{ name: 'A', weight: 5 }, { name: 'B', weight: 1 }]
    expect(validateTeamsForMode(valid, 'weighted').valid).toBe(true)
  })
})
