export type RetryDecision = {
  shouldRetry: boolean;
  delayMs: number;
};

export function nextRetryDelayMs(retryCount: number, baseMs = 1000, maxMs = 60_000): number {
  const attempt = Math.max(0, retryCount);
  const delay = baseMs * 2 ** attempt;
  return Math.min(maxMs, delay);
}

export function decideRetry(input: {
  retryCount: number;
  maxRetries: number;
  baseMs?: number;
  maxMs?: number;
}): RetryDecision {
  if (input.retryCount >= input.maxRetries) {
    return { shouldRetry: false, delayMs: 0 };
  }
  return {
    shouldRetry: true,
    delayMs: nextRetryDelayMs(input.retryCount, input.baseMs, input.maxMs),
  };
}
