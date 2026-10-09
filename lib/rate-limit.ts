type Attempt = { count: number; resetAt: number }

const attempts = new Map<string, Attempt>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

export function isRateLimited(key: string) {
  const now = Date.now()
  const attempt = attempts.get(key)
  return Boolean(attempt && attempt.resetAt > now && attempt.count >= MAX_ATTEMPTS)
}

export function recordFailedAttempt(key: string) {
  const now = Date.now()
  const current = attempts.get(key)
  const attempt = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current
  attempt.count += 1
  attempts.set(key, attempt)
}

export function clearAttempts(key: string) {
  attempts.delete(key)
}
