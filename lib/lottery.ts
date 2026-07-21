/**
 * Fisher-Yates shuffle. Returns a new array; input is never mutated.
 * Index 0 = slot 1 winner.
 */
export function randomOrder(teamIds: string[]): string[] {
  const result = [...teamIds]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Weighted-random-without-replacement draw. Each draw picks one team from
 * the remaining weighted pool; higher weight = higher chance of an earlier
 * (better) slot. Index 0 = slot 1 winner. Input is never mutated.
 */
export function weightedOrder(teams: { id: string; weight: number }[]): string[] {
  const pool = teams.map((t) => ({ ...t }))
  const result: string[] = []

  while (pool.length > 0) {
    const totalWeight = pool.reduce((sum, t) => sum + t.weight, 0)
    let roll = Math.random() * totalWeight
    let winnerIndex = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight
      if (roll <= 0) {
        winnerIndex = i
        break
      }
    }
    result.push(pool[winnerIndex].id)
    pool.splice(winnerIndex, 1)
  }

  return result
}

/**
 * Converts a slot-ascending order (index 0 = slot 1) into the bottom-up
 * reveal sequence (index 0 = first revealed = worst slot).
 */
export function toRevealSequence(slotOrder: string[]): string[] {
  return [...slotOrder].reverse()
}
