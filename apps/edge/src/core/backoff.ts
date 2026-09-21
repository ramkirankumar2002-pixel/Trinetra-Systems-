export function nextRetryDelayMs(retryCount: number, baseMs = 1000, maxMs = 60_000): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, retryCount));
}

export function shouldRetry(retryCount: number, maxRetries: number): boolean {
  return retryCount < maxRetries;
}
