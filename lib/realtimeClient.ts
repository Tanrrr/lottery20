import { supabaseBrowser } from './supabaseBrowser'
import type { RevealBroadcastPayload } from './realtime'

export function subscribeToReveals(
  viewerToken: string,
  onReveal: (payload: RevealBroadcastPayload) => void
): () => void {
  const channel = supabaseBrowser
    .channel(`league:${viewerToken}`)
    .on('broadcast', { event: 'pick-revealed' }, ({ payload }) => onReveal(payload as RevealBroadcastPayload))
    .subscribe()

  return () => {
    supabaseBrowser.removeChannel(channel)
  }
}
