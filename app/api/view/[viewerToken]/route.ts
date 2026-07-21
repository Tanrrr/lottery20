import { NextRequest, NextResponse } from 'next/server'
import { getViewerState } from '@/lib/leagueService'
import { enforceRateLimit } from '@/lib/rateLimit'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'
import { fail } from '@/lib/apiResponse'

const repo = new SupabaseLeagueRepository()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewerToken: string }> }
) {
  try {
    const { viewerToken } = await params
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const limited = await enforceRateLimit(repo, `${ip}:GET:/api/view`)
    if (limited) return NextResponse.json(limited, { status: 429 })

    const result = await getViewerState(repo, viewerToken)
    return NextResponse.json(result, { status: result.success ? 200 : 404 })
  } catch {
    return NextResponse.json(fail('Something went wrong'), { status: 500 })
  }
}
