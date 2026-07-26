import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import RevealAnimation from './RevealAnimation'
import { REVEAL_ANIMATION_MS, REVEAL_SOUND_SRC } from '@/lib/constants'

describe('RevealAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the slot and team name', () => {
    render(<RevealAnimation pick={{ slot: 6, teamName: 'Chaos Muppets' }} onComplete={() => {}} />)
    expect(screen.getByText(/slot 6/i)).toBeInTheDocument()
    expect(screen.getByText(/chaos muppets/i)).toBeInTheDocument()
  })

  it('renders an audio element with the configured sound source', () => {
    const { container } = render(
      <RevealAnimation pick={{ slot: 6, teamName: 'Chaos Muppets' }} onComplete={() => {}} />
    )
    const audio = container.querySelector('audio')
    expect(audio).toHaveAttribute('src', REVEAL_SOUND_SRC)
  })

  it('does not call onComplete before the animation duration elapses', () => {
    const onComplete = vi.fn()
    render(<RevealAnimation pick={{ slot: 6, teamName: 'Chaos Muppets' }} onComplete={onComplete} />)

    vi.advanceTimersByTime(REVEAL_ANIMATION_MS - 100)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('calls onComplete exactly once after the animation duration elapses', () => {
    const onComplete = vi.fn()
    render(<RevealAnimation pick={{ slot: 6, teamName: 'Chaos Muppets' }} onComplete={onComplete} />)

    vi.advanceTimersByTime(REVEAL_ANIMATION_MS)

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
