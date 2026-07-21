import { describe, it, expect } from 'vitest'
import { generateToken } from './tokens'

describe('generateToken', () => {
  it('returns a URL-safe string of reasonable length', () => {
    const token = generateToken()
    expect(token.length).toBeGreaterThanOrEqual(20)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('returns a different value on each call', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
  })
})
