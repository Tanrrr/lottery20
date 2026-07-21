import { NextRequest, NextResponse } from 'next/server'
import { revealNext, getCommissionerView } from '@/lib/leagueService'
import { enforceRateLimit } from '@/lib/rateLimit'
import { broadcastReveal } from '@/lib/realtime'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'
import { fail } from '@/lib/apiResponse'
import { REVEAL_RATE_LIMIT_MAX_REQUESTS } from '@/lib/constants'

const repo = new SupabaseLeagueRepository()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commissionerToken: string }> }
) {
  try {
    const { commissionerToken } = await params
    // Keyed per-league (not per-IP-globally): revealing a draft is a bounded,
    // commissioner-initiated action capped at MAX_TEAMS reveals per league, so
    // it shouldn't share the general per-IP abuse-prevention budget with other
    // routes/leagues.
    const limited = await enforceRateLimit(repo, `${commissionerToken}:reveal`, REVEAL_RATE_LIMIT_MAX_REQUESTS)
    if (limited) return NextResponse.json(limited, { status: 429 })

    const body = await request.json()
    const result = await revealNext(repo, commissionerToken, body.expectedRevealedCount)

    if (!result.success) {
      const status = result.error.includes('already revealed') ? 409 : 400
      return NextResponse.json(result, { status })
    }

    const view = await getCommissionerView(repo, commissionerToken)
    if (view.success) {
      await broadcastReveal(view.data.league.viewerToken, {
        teamId: result.data.teamId,
        teamName: result.data.teamName,
        slot: result.data.slot,
        status: result.data.status as 'live' | 'complete',
      })
    }

    return NextResponse.json(result, { status: 200 })
  } catch {
    return NextResponse.json(fail('Something went wrong'), { status: 500 })
  }
}
