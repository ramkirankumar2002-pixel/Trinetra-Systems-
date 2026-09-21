export const WEBHOOK_MAX_ATTEMPTS = 6;

const BACKOFF_MS = [15_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export function nextWebhookRetryAt(attemptCount: number, now = new Date()): Date | null {
  if (attemptCount >= WEBHOOK_MAX_ATTEMPTS) {
    return null;
  }
  const delay = BACKOFF_MS[Math.min(attemptCount, BACKOFF_MS.length - 1)] ?? 15_000;
  return new Date(now.getTime() + delay);
}

export function shouldAbandonWebhook(attemptCount: number): boolean {
  return attemptCount >= WEBHOOK_MAX_ATTEMPTS;
}
