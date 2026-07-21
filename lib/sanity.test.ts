import { describe, it, expect } from 'vitest'
import { ping } from './sanity'

describe('ping', () => {
  it('returns pong', () => {
    expect(ping()).toBe('pong')
  })
})
