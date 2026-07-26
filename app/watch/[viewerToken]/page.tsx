'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { subscribeToReveals } from '@/lib/realtimeClient'
import RevealAnimation from '@/components/RevealAnimation'
import { REVEAL_SOUND_SRC } from '@/lib/constants'
import type { PublicLeagueState } from '@/lib/types'

interface PendingPick {
  teamId: string
  teamName: string
  slot: number
  status: PublicLeagueState['status']
}

export default function Page() {
  const { viewerToken } = useParams<{ viewerToken: string }>()
  const [state, setState] = useState<PublicLeagueState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingQueue, setPendingQueue] = useState<PendingPick[]>([])
  const currentPick = pendingQueue[0] ?? null
  const [soundEnabled, setSoundEnabled] = useState(false)
  const primerRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLeague() {
      try {
        const response = await fetch(`/api/view/${viewerToken}`)
        const body = await response.json()
        if (cancelled) return
        if (body.success) {
          setState(body.data)
        } else {
          setError(body.error || 'Failed to load league')
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load league'
        setError(message)
      }
    }
    loadLeague()

    return () => {
      cancelled = true
    }
  }, [viewerToken])

  useEffect(() => {
    if (!state || state.status === 'complete') return
    return subscribeToReveals(viewerToken, (payload) => {
      setPendingQueue((prev) => [
        ...prev,
        {
          teamId: payload.teamId,
          teamName: payload.teamName,
          slot: payload.slot,
          status: payload.status,
        },
      ])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerToken, state?.status])

  function handleAnimationComplete() {
    if (!currentPick) return
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        status: currentPick.status,
        revealed: [...prev.revealed, { teamId: currentPick.teamId, teamName: currentPick.teamName, slot: currentPick.slot }],
      }
    })
    setPendingQueue((prev) => prev.slice(1))
  }

  function enableSound() {
    const audio = primerRef.current
    if (audio) {
      audio
        .play()
        .then(() => audio.pause())
        .catch(() => {})
    }
    setSoundEnabled(true)
  }

  if (error && !state) {
    return (
      <main className="p-8">
        <p className="text-red-600">{error}</p>
      </main>
    )
  }

  if (!state) return <main className="p-8">Loading...</main>

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{state.name}</h1>
      <p className="text-sm text-gray-600">{state.teamCount} teams &middot; {state.status}</p>
      {!soundEnabled && (
        <button
          onClick={enableSound}
          className="mt-3 border rounded px-4 py-2 text-sm"
        >
          🔊 Tap to enable sound
        </button>
      )}
      <audio ref={primerRef} src={REVEAL_SOUND_SRC} />
      <div className="mt-6 flex flex-col gap-2">
        {state.revealed.map((pick, i) => (
          <div key={i} className="border rounded px-4 py-2 animate-in fade-in">
            Slot {pick.slot} — {pick.teamName}
          </div>
        ))}
      </div>
      {currentPick && (
        <RevealAnimation
          key={currentPick.slot}
          pick={{ slot: currentPick.slot, teamName: currentPick.teamName }}
          onComplete={handleAnimationComplete}
        />
      )}
    </main>
  )
}
