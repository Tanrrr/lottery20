import { generateToken } from './tokens'
import { RevealConflictError, type LeagueRepository, type RevealResult, type RateLimitResult } from './repository'
import type { League, LeagueWithTeams, Team, LotteryMode } from './types'

interface RateLimitEntry {
  windowStart: number
  count: number
}

export class MemoryLeagueRepository implements LeagueRepository {
  private leagues = new Map<string, League>()
  private teamsByLeagueId = new Map<string, Team[]>()
  private rateLimits = new Map<string, RateLimitEntry>()

  async createLeague(input: { name: string; mode: LotteryMode }): Promise<League> {
    const league: League = {
      id: generateToken(),
      commissionerToken: generateToken(),
      viewerToken: generateToken(),
      name: input.name,
      mode: input.mode,
      status: 'setup',
      revealOrder: null,
      revealedCount: 0,
    }
    this.leagues.set(league.id, league)
    this.teamsByLeagueId.set(league.id, [])
    return { ...league }
  }

  async getByCommissionerToken(token: string): Promise<LeagueWithTeams | null> {
    const league = [...this.leagues.values()].find((l) => l.commissionerToken === token)
    if (!league) return null
    return {
      league: { ...league, revealOrder: league.revealOrder ? [...league.revealOrder] : null },
      teams: (this.teamsByLeagueId.get(league.id) ?? []).map((t) => ({ ...t })),
    }
  }

  async getByViewerToken(token: string): Promise<LeagueWithTeams | null> {
    const league = [...this.leagues.values()].find((l) => l.viewerToken === token)
    if (!league) return null
    return {
      league: { ...league, revealOrder: league.revealOrder ? [...league.revealOrder] : null },
      teams: (this.teamsByLeagueId.get(league.id) ?? []).map((t) => ({ ...t })),
    }
  }

  async replaceTeams(
    commissionerToken: string,
    teams: { name: string; weight?: number }[]
  ): Promise<Team[]> {
    const league = [...this.leagues.values()].find((l) => l.commissionerToken === commissionerToken)
    if (!league) throw new Error('League not found')

    const newTeams: Team[] = teams.map((t) => ({
      id: generateToken(),
      leagueId: league.id,
      name: t.name,
      weight: t.weight ?? null,
    }))
    this.teamsByLeagueId.set(league.id, newTeams)
    return newTeams.map((t) => ({ ...t }))
  }

  async startDraft(commissionerToken: string, revealOrder: string[]): Promise<League> {
    const league = [...this.leagues.values()].find((l) => l.commissionerToken === commissionerToken)
    if (!league) throw new Error('League not found')

    const updated: League = { ...league, status: 'live', revealOrder: [...revealOrder], revealedCount: 0 }
    this.leagues.set(league.id, updated)
    return { ...updated, revealOrder: updated.revealOrder ? [...updated.revealOrder] : null }
  }

  async revealNext(commissionerToken: string, expectedRevealedCount: number): Promise<RevealResult> {
    const league = [...this.leagues.values()].find((l) => l.commissionerToken === commissionerToken)
    if (!league) throw new Error('League not found')
    if (!league.revealOrder) throw new Error('Draft has not started')
    if (league.revealedCount !== expectedRevealedCount) throw new RevealConflictError()

    const revealedTeamId = league.revealOrder[expectedRevealedCount]
    const totalTeams = league.revealOrder.length
    const slot = totalTeams - expectedRevealedCount
    const newRevealedCount = expectedRevealedCount + 1

    const updated: League = {
      ...league,
      revealedCount: newRevealedCount,
      status: newRevealedCount === totalTeams ? 'complete' : 'live',
    }
    this.leagues.set(league.id, updated)

    return { league: { ...updated, revealOrder: updated.revealOrder ? [...updated.revealOrder] : null }, revealedTeamId, slot }
  }

  async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number
  ): Promise<RateLimitResult> {
    const existing = this.rateLimits.get(key)

    if (!existing || now - existing.windowStart >= windowMs) {
      this.rateLimits.set(key, { windowStart: now, count: 1 })
      return { allowed: true }
    }

    if (existing.count < maxRequests) {
      this.rateLimits.set(key, { ...existing, count: existing.count + 1 })
      return { allowed: true }
    }

    return { allowed: false }
  }
}
