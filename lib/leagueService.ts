import type { LeagueRepository } from './repository'
import { RevealConflictError } from './repository'
import { ok, fail, type ApiResponse } from './apiResponse'
import { createLeagueSchema, replaceTeamsSchema, validateTeamsForMode } from './validation'
import { randomOrder, weightedOrder, toRevealSequence } from './lottery'
import type { League, LeagueWithTeams, Team, PublicLeagueState } from './types'
import { MIN_TEAMS } from './constants'

export async function createLeague(
  repo: LeagueRepository,
  input: unknown
): Promise<ApiResponse<LeagueWithTeams>> {
  const parsed = createLeagueSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input')

  const league = await repo.createLeague(parsed.data)
  return ok({ league, teams: [] })
}

export async function replaceTeams(
  repo: LeagueRepository,
  commissionerToken: string,
  input: unknown
): Promise<ApiResponse<Team[]>> {
  const parsed = replaceTeamsSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input')

  const existing = await repo.getByCommissionerToken(commissionerToken)
  if (!existing) return fail('League not found')
  if (existing.league.status !== 'setup') return fail('Teams can only be edited before the draft starts')

  const modeCheck = validateTeamsForMode(parsed.data.teams, existing.league.mode)
  if (!modeCheck.valid) return fail(modeCheck.error ?? 'Invalid team weights')

  const teams = await repo.replaceTeams(commissionerToken, parsed.data.teams)
  return ok(teams)
}

export async function startDraft(
  repo: LeagueRepository,
  commissionerToken: string
): Promise<ApiResponse<League>> {
  const existing = await repo.getByCommissionerToken(commissionerToken)
  if (!existing) return fail('League not found')
  if (existing.league.status !== 'setup') return fail('Draft has already started')

  if (existing.teams.length < MIN_TEAMS) return fail(`At least ${MIN_TEAMS} teams are required`)

  const modeCheck = validateTeamsForMode(
    existing.teams.map((t) => ({ name: t.name, weight: t.weight ?? undefined })),
    existing.league.mode
  )
  if (!modeCheck.valid) return fail(modeCheck.error ?? 'Invalid team weights')

  const teamIds = existing.teams.map((t) => t.id)
  const slotOrder =
    existing.league.mode === 'weighted'
      ? weightedOrder(existing.teams.map((t) => ({ id: t.id, weight: t.weight ?? 0 })))
      : randomOrder(teamIds)

  const revealOrder = toRevealSequence(slotOrder)
  const updated = await repo.startDraft(commissionerToken, revealOrder)
  return ok(updated)
}

export async function revealNext(
  repo: LeagueRepository,
  commissionerToken: string,
  expectedRevealedCount: number
): Promise<ApiResponse<{ teamId: string; teamName: string; slot: number; status: League['status'] }>> {
  try {
    const result = await repo.revealNext(commissionerToken, expectedRevealedCount)
    const withTeams = await repo.getByCommissionerToken(commissionerToken)
    const teamName = withTeams?.teams.find((t) => t.id === result.revealedTeamId)?.name ?? 'Unknown team'
    return ok({ teamId: result.revealedTeamId, teamName, slot: result.slot, status: result.league.status })
  } catch (err) {
    if (err instanceof RevealConflictError) return fail('Someone else already revealed this pick')
    return fail(err instanceof Error ? err.message : 'Unable to reveal the next pick')
  }
}

export async function getCommissionerView(
  repo: LeagueRepository,
  commissionerToken: string
): Promise<ApiResponse<LeagueWithTeams>> {
  const existing = await repo.getByCommissionerToken(commissionerToken)
  if (!existing) return fail('League not found')
  return ok(existing)
}

export async function getViewerState(
  repo: LeagueRepository,
  viewerToken: string
): Promise<ApiResponse<PublicLeagueState>> {
  const existing = await repo.getByViewerToken(viewerToken)
  if (!existing) return fail('League not found')

  const teamsById = new Map(existing.teams.map((t) => [t.id, t]))
  const revealed = (existing.league.revealOrder ?? [])
    .slice(0, existing.league.revealedCount)
    .map((teamId, index) => {
      const totalTeams = existing.league.revealOrder!.length
      return {
        teamId,
        teamName: teamsById.get(teamId)?.name ?? 'Unknown team',
        slot: totalTeams - index,
      }
    })

  return ok({
    name: existing.league.name,
    mode: existing.league.mode,
    status: existing.league.status,
    teamCount: existing.teams.length,
    revealed,
  })
}
