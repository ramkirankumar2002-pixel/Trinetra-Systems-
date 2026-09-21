const SECRET_PATTERN = /password|passwd|secret|token|api[_-]?key|credential|authorization/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = SECRET_PATTERN.test(key) ? "[redacted]" : redactSecrets(entry);
  }
  return output;
}
