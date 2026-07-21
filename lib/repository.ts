import type { League, LeagueWithTeams, Team, LotteryMode } from './types'

export class RevealConflictError extends Error {
  constructor() {
    super('The reveal state changed before this request completed')
    this.name = 'RevealConflictError'
  }
}

export interface RevealResult {
  league: League
  revealedTeamId: string
  slot: number
}

export interface RateLimitResult {
  allowed: boolean
}

export interface LeagueRepository {
  createLeague(input: { name: string; mode: LotteryMode }): Promise<League>
  getByCommissionerToken(token: string): Promise<LeagueWithTeams | null>
  getByViewerToken(token: string): Promise<LeagueWithTeams | null>
  replaceTeams(
    commissionerToken: string,
    teams: { name: string; weight?: number }[]
  ): Promise<Team[]>
  startDraft(commissionerToken: string, revealOrder: string[]): Promise<League>
  /** Throws RevealConflictError if revealedCount !== expectedRevealedCount. */
  revealNext(commissionerToken: string, expectedRevealedCount: number): Promise<RevealResult>
  checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number
  ): Promise<RateLimitResult>
}
