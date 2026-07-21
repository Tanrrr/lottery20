import { NextRequest, NextResponse } from 'next/server'
import { startDraft } from '@/lib/leagueService'
import { enforceRateLimit } from '@/lib/rateLimit'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'
import { fail } from '@/lib/apiResponse'

const repo = new SupabaseLeagueRepository()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commissionerToken: string }> }
) {
  try {
    const { commissionerToken } = await params
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const limited = await enforceRateLimit(repo, `${ip}:POST:/api/leagues/start`)
    if (limited) return NextResponse.json(limited, { status: 429 })

    const result = await startDraft(repo, commissionerToken)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch {
    return NextResponse.json(fail('Something went wrong'), { status: 500 })
  }
}
