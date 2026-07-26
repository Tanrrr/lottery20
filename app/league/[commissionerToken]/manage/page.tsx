'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { League, Team } from '@/lib/types'
import { MIN_WEIGHT } from '@/lib/constants'
import RevealAnimation from '@/components/RevealAnimation'

interface TeamInput {
  name: string
  weight: string
}

function hasValidWeight(team: TeamInput): boolean {
  const parsed = Number(team.weight)
  return team.weight.trim() !== '' && !Number.isNaN(parsed) && parsed >= MIN_WEIGHT
}

export default function Page() {
  const { commissionerToken } = useParams<{ commissionerToken: string }>()
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamInputs, setTeamInputs] = useState<TeamInput[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadLeague() {
      try {
        const response = await fetch(`/api/leagues/${commissionerToken}`)
        const body = await response.json()
        if (cancelled) return
        if (body.success) {
          setLeague(body.data.league)
          setTeams(body.data.teams)
          setTeamInputs(
            body.data.teams.map((t: Team) => ({ name: t.name, weight: t.weight?.toString() ?? '' }))
          )
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

  async function saveTeamsRequest(): Promise<boolean> {
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

  async function saveTeams(): Promise<boolean> {
    setIsSaving(true)
    try {
      return await saveTeamsRequest()
    } finally {
      setIsSaving(false)
    }
  }

  async function startDraft() {
    setError(null)
    setIsSaving(true)
    try {
      const saved = await saveTeamsRequest()
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
    } finally {
      setIsSaving(false)
    }
  }

  if (league.status === 'live' || league.status === 'complete') {
    return <LiveDraftView commissionerToken={commissionerToken} league={league} teams={teams} />
  }

  const hasInvalidWeight = league.mode === 'weighted' && teamInputs.some((t) => !hasValidWeight(t))
  const startDraftDisabled = isSaving || hasInvalidWeight

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
        <button onClick={addTeam} disabled={isSaving} className="border rounded px-4 py-2 disabled:opacity-50">
          Add team
        </button>
        <button onClick={saveTeams} disabled={isSaving} className="border rounded px-4 py-2 disabled:opacity-50">
          Save teams
        </button>
        <button
          onClick={startDraft}
          disabled={startDraftDisabled}
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
        >
          Start Draft
        </button>
      </div>

      {hasInvalidWeight && (
        <p className="mt-3 text-amber-700">
          Every team needs a weight of at least {MIN_WEIGHT} before you can start a weighted draft.
        </p>
      )}
      {error && <p className="mt-3 text-red-600">{error}</p>}
    </main>
  )
}

function LiveDraftView({
  commissionerToken,
  league,
  teams,
}: {
  commissionerToken: string
  league: League
  teams: Team[]
}) {
  const teamsById = new Map(teams.map((t) => [t.id, t]))
  const computeInitialRevealed = () => {
    if (!league.revealOrder || league.revealedCount === 0) return []
    return league.revealOrder.slice(0, league.revealedCount).map((teamId, index) => {
      const totalTeams = league.revealOrder!.length
      return {
        teamId,
        teamName: teamsById.get(teamId)?.name ?? 'Unknown team',
        slot: totalTeams - index,
      }
    })
  }

  const [revealed, setRevealed] = useState<{ teamId: string; teamName: string; slot: number }[]>(
    computeInitialRevealed
  )
  const [pendingPick, setPendingPick] = useState<{ teamId: string; teamName: string; slot: number } | null>(
    null
  )
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
      setPendingPick({ teamId: body.data.teamId, teamName: body.data.teamName, slot: body.data.slot })
      setStatus(body.data.status)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reveal pick'
      setError(message)
    }
  }

  function handleAnimationComplete() {
    if (!pendingPick) return
    setRevealed((prev) => [...prev, pendingPick])
    setPendingPick(null)
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
      {pendingPick && <RevealAnimation key={pendingPick.slot} pick={pendingPick} onComplete={handleAnimationComplete} />}
      {(status !== 'complete' || pendingPick !== null) && (
        <button
          onClick={revealNext}
          disabled={pendingPick !== null}
          className="mt-4 bg-black text-white rounded px-4 py-2 disabled:opacity-50"
        >
          Reveal Next Pick
        </button>
      )}
      {error && <p className="mt-3 text-red-600">{error}</p>}
    </main>
  )
}
