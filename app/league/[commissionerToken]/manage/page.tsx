'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { League, Team } from '@/lib/types'

interface TeamInput {
  name: string
  weight: string
}

export default function Page() {
  const { commissionerToken } = useParams<{ commissionerToken: string }>()
  const [league, setLeague] = useState<League | null>(null)
  const [teamInputs, setTeamInputs] = useState<TeamInput[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadLeague() {
      try {
        const response = await fetch(`/api/leagues/${commissionerToken}`)
        const body = await response.json()
        if (body.success) {
          setLeague(body.data.league)
          setTeamInputs(
            body.data.teams.map((t: Team) => ({ name: t.name, weight: t.weight?.toString() ?? '' }))
          )
        } else {
          setError(body.error || 'Failed to load league')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load league'
        setError(message)
      }
    }
    loadLeague()
  }, [commissionerToken])

  if (error && !league) {
    return (
      <main className="p-8">
        <p className="text-red-600">{error}</p>
      </main>
    )
  }

  if (!league) return <main className="p-8">Loading...</main>

  function updateTeam(index: number, field: keyof TeamInput, value: string) {
    setTeamInputs((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)))
  }

  function addTeam() {
    setTeamInputs((prev) => [...prev, { name: '', weight: '' }])
  }

  async function saveTeams(): Promise<boolean> {
    setError(null)
    try {
      const teams = teamInputs.map((t) => ({
        name: t.name,
        weight: t.weight ? Number(t.weight) : undefined,
      }))
      const response = await fetch(`/api/leagues/${commissionerToken}/teams`, {
        method: 'PUT',
        body: JSON.stringify({ teams }),
      })
      const body = await response.json()
      if (!body.success) {
        setError(body.error || 'Failed to save teams')
        return false
      }
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save teams'
      setError(message)
      return false
    }
  }

  async function startDraft() {
    setError(null)
    try {
      const saved = await saveTeams()
      if (!saved) return
      const response = await fetch(`/api/leagues/${commissionerToken}/start`, { method: 'POST' })
      const body = await response.json()
      if (!body.success) {
        setError(body.error || 'Failed to start draft')
        return
      }
      setLeague(body.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start draft'
      setError(message)
    }
  }

  if (league.status === 'live' || league.status === 'complete') {
    return <LiveDraftView commissionerToken={commissionerToken} league={league} />
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{league.name}</h1>
      <p className="mt-2 text-sm font-semibold text-amber-700">
        Bookmark this page &mdash; it&rsquo;s your only way to manage this league. There&rsquo;s no login, so if you lose this link it can&rsquo;t be recovered.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Share this viewer link with your league: <code>/watch/{league.viewerToken}</code>
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {teamInputs.map((team, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="border rounded px-3 py-2 flex-1"
              placeholder="Team name"
              value={team.name}
              onChange={(e) => updateTeam(i, 'name', e.target.value)}
            />
            {league.mode === 'weighted' && (
              <input
                className="border rounded px-3 py-2 w-24"
                placeholder="Weight"
                type="number"
                min={1}
                value={team.weight}
                onChange={(e) => updateTeam(i, 'weight', e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <button onClick={addTeam} className="border rounded px-4 py-2">
          Add team
        </button>
        <button onClick={saveTeams} className="border rounded px-4 py-2">
          Save teams
        </button>
        <button onClick={startDraft} className="bg-black text-white rounded px-4 py-2">
          Start Draft
        </button>
      </div>

      {error && <p className="mt-3 text-red-600">{error}</p>}
    </main>
  )
}

function LiveDraftView({ commissionerToken, league }: { commissionerToken: string; league: League }) {
  const [revealed, setRevealed] = useState<{ teamId: string; teamName: string; slot: number }[]>([])
  const [status, setStatus] = useState(league.status)
  const [error, setError] = useState<string | null>(null)

  async function revealNext() {
    setError(null)
    try {
      const response = await fetch(`/api/leagues/${commissionerToken}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevealedCount: revealed.length }),
      })
      const body = await response.json()
      if (!body.success) {
        setError(body.error || 'Failed to reveal pick')
        return
      }
      setRevealed((prev) => [
        ...prev,
        { teamId: body.data.teamId, teamName: body.data.teamName, slot: body.data.slot },
      ])
      setStatus(body.data.status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reveal pick'
      setError(message)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{league.name}</h1>
      <div className="mt-6 flex flex-col gap-2">
        {revealed.map((pick, i) => (
          <div key={i} className="border rounded px-4 py-2">
            Slot {pick.slot} — {pick.teamName}
          </div>
        ))}
      </div>
      {status !== 'complete' && (
        <button onClick={revealNext} className="mt-4 bg-black text-white rounded px-4 py-2">
          Reveal Next Pick
        </button>
      )}
      {error && <p className="mt-3 text-red-600">{error}</p>}
    </main>
  )
}
