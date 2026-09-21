import type { PublicUser } from "./types.ts";

export function hasPermission(user: PublicUser | null, ...codes: string[]): boolean {
  if (!user) {
    return false;
  }

  return codes.some((code) => user.permissions.includes(code));
}
