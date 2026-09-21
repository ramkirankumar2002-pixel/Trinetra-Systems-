const SECRET_KEY_PATTERN =
  /password|passwd|secret|token|api[_-]?key|credential|authorization|private[_-]?key/i;

export function isSecretFieldName(name: string): boolean {
  return SECRET_KEY_PATTERN.test(name);
}

export function stripSecretFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripSecretFields(item));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSecretFieldName(key)) {
      continue;
    }
    output[key] = stripSecretFields(entry);
  }
  return output;
}

export function rejectSecretFields(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const rejected = rejectSecretFields(item);
      if (rejected) {
        return rejected;
      }
    }
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (isSecretFieldName(key)) {
      return "Device configuration cannot include secrets. Store credentials on the server only.";
    }
    const nested = rejectSecretFields(entry);
    if (nested) {
      return nested;
    }
  }
  return null;
}
