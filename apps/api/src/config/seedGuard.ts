export function demoSeedBlockedReason(input: {
  nodeEnv: string | undefined;
  allowDemoSeed: string | undefined;
}): string | null {
  const nodeEnv = (input.nodeEnv ?? "").trim().toLowerCase();
  const allow = (input.allowDemoSeed ?? "").trim().toLowerCase();
  const allowListed = allow === "true" || allow === "1" || allow === "yes";
  if (nodeEnv === "production" && !allowListed) {
    return "Demo seed is blocked when NODE_ENV=production. Use a dedicated demo environment, or set ALLOW_DEMO_SEED=true only for an isolated non-customer database.";
  }
  return null;
}
