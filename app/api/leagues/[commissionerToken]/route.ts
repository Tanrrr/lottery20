import { NextRequest, NextResponse } from 'next/server'
import { getCommissionerView } from '@/lib/leagueService'
import { SupabaseLeagueRepository } from '@/lib/repository.supabase'

const repo = new SupabaseLeagueRepository()

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ commissionerToken: string }> }
) {
  const { commissionerToken } = await params
  const result = await getCommissionerView(repo, commissionerToken)
  return NextResponse.json(result, { status: result.success ? 200 : 404 })
}
