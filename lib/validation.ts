import { z } from 'zod'
import { MIN_TEAMS, MAX_TEAMS, MIN_WEIGHT } from './constants'
import type { LotteryMode } from './types'

export const createLeagueSchema = z.object({
  name: z.string().trim().min(1).max(100),
  mode: z.enum(['random', 'weighted']),
})

export const teamInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  weight: z.number().min(0).optional(),
})

export const replaceTeamsSchema = z.object({
  teams: z.array(teamInputSchema).min(MIN_TEAMS).max(MAX_TEAMS),
})

export interface TeamModeValidation {
  valid: boolean
  error: string | null
}

export function validateTeamsForMode(
  teams: { name: string; weight?: number }[],
  mode: LotteryMode
): TeamModeValidation {
  if (mode === 'random') {
    return { valid: true, error: null }
  }

  const invalid = teams.some((t) => t.weight === undefined || t.weight < MIN_WEIGHT)
  if (invalid) {
    return { valid: false, error: `Every team needs a weight of at least ${MIN_WEIGHT} in weighted mode` }
  }

  return { valid: true, error: null }
}
