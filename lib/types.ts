export type LotteryMode = 'random' | 'weighted'
export type LeagueStatus = 'setup' | 'live' | 'complete'

export interface Team {
  id: string
  leagueId: string
  name: string
  weight: number | null
}

export interface League {
  id: string
  commissionerToken: string
  viewerToken: string
  name: string
  mode: LotteryMode
  status: LeagueStatus
  revealOrder: string[] | null // team ids, reveal sequence: index 0 = first revealed
  revealedCount: number
}

export interface DraftResult {
  leagueId: string
  teamId: string
  slot: number
}

export interface LeagueWithTeams {
  league: League
  teams: Team[]
}

export interface PublicLeagueState {
  name: string
  mode: LotteryMode
  status: LeagueStatus
  teamCount: number
  revealed: Array<{ teamId: string; teamName: string; slot: number }>
}
