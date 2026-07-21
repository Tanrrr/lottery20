export const MIN_TEAMS = 6
export const MAX_TEAMS = 32
export const MIN_WEIGHT = 1
export const RATE_LIMIT_MAX_REQUESTS = 30
export const RATE_LIMIT_WINDOW_MS = 60_000
// Reveal is a bounded, commissioner-initiated action (at most MAX_TEAMS reveals
// ever happen for one league), not a general abuse vector like league creation,
// so it gets its own higher ceiling keyed per-league instead of per-IP-globally.
export const REVEAL_RATE_LIMIT_MAX_REQUESTS = 50
