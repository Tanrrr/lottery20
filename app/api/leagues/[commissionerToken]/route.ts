import { NextRequest, NextResponse } from 'next/server'
import { getCommissionerView } from '@/lib/leagueService'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'
import { fail } from '@/lib/apiResponse'

const repo = new SupabaseLeagueRepository()

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ commissionerToken: string }> }
) {
  try {
    const { commissionerToken } = await params
    const result = await getCommissionerView(repo, commissionerToken)
    return NextResponse.json(result, { status: result.success ? 200 : 404 })
  } catch {
    return NextResponse.json(fail('Something went wrong'), { status: 500 })
  }
}
