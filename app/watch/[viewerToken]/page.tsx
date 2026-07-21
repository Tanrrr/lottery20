'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { subscribeToReveals } from '@/lib/realtimeClient'
import type { PublicLeagueState } from '@/lib/types'

export default function Page() {
  const { viewerToken } = useParams<{ viewerToken: string }>()
  const [state, setState] = useState<PublicLeagueState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadLeague() {
      try {
        const response = await fetch(`/api/view/${viewerToken}`)
        const body = await response.json()
        if (body.success) {
          setState(body.data)
        } else {
          setError(body.error || 'Failed to load league')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load league'
        setError(message)
      }
    }
    loadLeague()
  }, [viewerToken])

  useEffect(() => {
    if (!state || state.status === 'complete') return
    return subscribeToReveals(viewerToken, (payload) => {
      setState((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          status: payload.status,
          revealed: [...prev.revealed, { teamId: payload.teamId, teamName: payload.teamName, slot: payload.slot }],
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerToken, state?.status])

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
      <div className="mt-6 flex flex-col gap-2">
        {state.revealed.map((pick, i) => (
          <div key={i} className="border rounded px-4 py-2 animate-in fade-in">
            Slot {pick.slot} — {pick.teamName}
          </div>
        ))}
      </div>
    </main>
  )
}
