import type { LeagueRepository } from './repository'
import { fail, type ApiResponse } from './apiResponse'
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from './constants'

export async function enforceRateLimit(
  repo: LeagueRepository,
  key: string,
  maxRequests: number = RATE_LIMIT_MAX_REQUESTS
): Promise<ApiResponse<null> | null> {
  const result = await repo.checkRateLimit(key, maxRequests, RATE_LIMIT_WINDOW_MS, Date.now())
  if (!result.allowed) return fail('Too many requests, please slow down')
  return null
}
