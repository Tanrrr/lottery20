import { supabaseAdmin } from './supabaseAdmin'

export interface RevealBroadcastPayload {
  teamId: string
  teamName: string
  slot: number
  status: 'live' | 'complete'
}

export async function broadcastReveal(viewerToken: string, payload: RevealBroadcastPayload): Promise<void> {
  const channel = supabaseAdmin.channel(`league:${viewerToken}`)
  await channel.send({ type: 'broadcast', event: 'pick-revealed', payload })
}
