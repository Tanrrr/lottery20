import { supabaseAdmin } from './supabaseAdmin'
import { generateToken } from './tokens'
import { RevealConflictError, type LeagueRepository, type RevealResult, type RateLimitResult } from './repository'
import type { League, LeagueWithTeams, Team, LotteryMode, LeagueStatus } from './types'

interface LeagueRow {
  id: string
  commissioner_token: string
  viewer_token: string
  name: string
  mode: string
  status: string
  reveal_order: string[] | null
  revealed_count: number
}

interface TeamRow {
  id: string
  league_id: string
  name: string
  weight: number | null
}

function toLeague(row: LeagueRow): League {
  return {
    id: row.id,
    commissionerToken: row.commissioner_token,
    viewerToken: row.viewer_token,
    name: row.name,
    mode: row.mode as LotteryMode,
    status: row.status as LeagueStatus,
    revealOrder: row.reveal_order,
    revealedCount: row.revealed_count,
  }
}

function toTeam(row: TeamRow): Team {
  return { id: row.id, leagueId: row.league_id, name: row.name, weight: row.weight }
}

export class SupabaseLeagueRepository implements LeagueRepository {
  async createLeague(input: { name: string; mode: LotteryMode }): Promise<League> {
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .insert({
        commissioner_token: generateToken(),
        viewer_token: generateToken(),
        name: input.name,
        mode: input.mode,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return toLeague(data)
  }

  private async findLeagueRow(column: 'commissioner_token' | 'viewer_token', token: string) {
    const { data, error } = await supabaseAdmin.from('leagues').select().eq(column, token).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  private async withTeams(row: LeagueRow): Promise<LeagueWithTeams> {
    const { data: teamRows, error } = await supabaseAdmin.from('teams').select().eq('league_id', row.id)
    if (error) throw new Error(error.message)
    return { league: toLeague(row), teams: (teamRows ?? []).map(toTeam) }
  }

  async getByCommissionerToken(token: string): Promise<LeagueWithTeams | null> {
    const row = await this.findLeagueRow('commissioner_token', token)
    return row ? this.withTeams(row) : null
  }

  async getByViewerToken(token: string): Promise<LeagueWithTeams | null> {
    const row = await this.findLeagueRow('viewer_token', token)
    return row ? this.withTeams(row) : null
  }

  async replaceTeams(
    commissionerToken: string,
    teams: { name: string; weight?: number }[]
  ): Promise<Team[]> {
    const row = await this.findLeagueRow('commissioner_token', commissionerToken)
    if (!row) throw new Error('League not found')

    const { error: deleteError } = await supabaseAdmin.from('teams').delete().eq('league_id', row.id)
    if (deleteError) throw new Error(deleteError.message)

    const { data, error } = await supabaseAdmin
      .from('teams')
      .insert(teams.map((t) => ({ league_id: row.id, name: t.name, weight: t.weight ?? null })))
      .select()

    if (error) throw new Error(error.message)
    return (data ?? []).map(toTeam)
  }

  async startDraft(commissionerToken: string, revealOrder: string[]): Promise<League> {
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .update({ status: 'live', reveal_order: revealOrder, revealed_count: 0 })
      .eq('commissioner_token', commissionerToken)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return toLeague(data)
  }

  async revealNext(commissionerToken: string, expectedRevealedCount: number): Promise<RevealResult> {
    const row = await this.findLeagueRow('commissioner_token', commissionerToken)
    if (!row) throw new Error('League not found')
    if (!row.reveal_order) throw new Error('Draft has not started')

    const totalTeams = row.reveal_order.length
    const revealedTeamId = row.reveal_order[expectedRevealedCount]
    const slot = totalTeams - expectedRevealedCount
    const newRevealedCount = expectedRevealedCount + 1
    const newStatus = newRevealedCount === totalTeams ? 'complete' : 'live'

    // Conditional update: only succeeds if revealed_count still matches what
    // this request expected. If another request already advanced it, this
    // returns zero rows and we surface a RevealConflictError.
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .update({ revealed_count: newRevealedCount, status: newStatus })
      .eq('commissioner_token', commissionerToken)
      .eq('revealed_count', expectedRevealedCount)
      .select()
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new RevealConflictError()

    const { error: insertError } = await supabaseAdmin
      .from('draft_results')
      .insert({ league_id: row.id, team_id: revealedTeamId, slot })

    if (insertError) throw new Error(insertError.message)

    return { league: toLeague(data), revealedTeamId, slot }
  }

  async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number
  ): Promise<RateLimitResult> {
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('rate_limits')
      .select()
      .eq('key', key)
      .maybeSingle()

    if (selectError) throw new Error(selectError.message)

    const nowIso = new Date(now).toISOString()

    if (!existing || now - new Date(existing.window_start).getTime() >= windowMs) {
      const { error } = await supabaseAdmin
        .from('rate_limits')
        .upsert({ key, window_start: nowIso, count: 1 })
      if (error) throw new Error(error.message)
      return { allowed: true }
    }

    if (existing.count < maxRequests) {
      const { error } = await supabaseAdmin
        .from('rate_limits')
        .update({ count: existing.count + 1 })
        .eq('key', key)
      if (error) throw new Error(error.message)
      return { allowed: true }
    }

    return { allowed: false }
  }
}
