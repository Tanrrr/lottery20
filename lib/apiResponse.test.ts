import { describe, it, expect } from 'vitest'
import { ok, fail } from './apiResponse'

describe('ok', () => {
  it('wraps data in a success envelope', () => {
    expect(ok({ id: '1' })).toEqual({ success: true, data: { id: '1' } })
  })
})

describe('fail', () => {
  it('wraps a message in a failure envelope', () => {
    expect(fail('not found')).toEqual({ success: false, error: 'not found' })
  })
})
