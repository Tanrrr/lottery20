'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LotteryMode } from '@/lib/types'
import { createLeagueSchema } from '@/lib/validation'

export default function Page() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<LotteryMode>('random')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validation = createLeagueSchema.safeParse({ name, mode })
    if (!validation.success) {
      setError('League name must be between 1 and 100 characters')
      return
    }

    try {
      const response = await fetch('/api/leagues', {
        method: 'POST',
        body: JSON.stringify({ name, mode }),
      })
      const body = await response.json()

      if (!body.success) {
        setError(body.error)
        return
      }

      router.push(`/league/${body.data.league.commissionerToken}/manage`)
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Fantasy Draft Lottery</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          League name
          <input
            className="border rounded px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          Lottery mode
          <select
            className="border rounded px-3 py-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as LotteryMode)}
          >
            <option value="random">Random — equal odds for everyone</option>
            <option value="weighted">Weighted — custom odds per team</option>
          </select>
        </label>
        {error && <p className="text-red-600">{error}</p>}
        <button type="submit" className="bg-black text-white rounded px-4 py-2">
          Create League
        </button>
      </form>
    </main>
  )
}
