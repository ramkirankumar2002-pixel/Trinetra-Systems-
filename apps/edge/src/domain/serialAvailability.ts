import { existsSync } from "node:fs";

export function serialPortAvailability(port: string): { available: boolean; reason: string | null } {
  if (!/^COM\d+$/i.test(port) && !/^\/dev\/tty[A-Za-z0-9._-]+$/.test(port)) {
    return { available: false, reason: "DEVICE NOT AVAILABLE" };
  }
  if (process.platform === "win32") {
    try {
      return existsSync(`\\\\.\\${port}`)
        ? { available: true, reason: null }
        : { available: false, reason: "DEVICE NOT AVAILABLE" };
    } catch {
      return { available: false, reason: "DEVICE NOT AVAILABLE" };
    }
  }
  return existsSync(port) ? { available: true, reason: null } : { available: false, reason: "DEVICE NOT AVAILABLE" };
}
