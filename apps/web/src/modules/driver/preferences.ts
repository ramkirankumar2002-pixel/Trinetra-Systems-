import { resolveLocale } from "./i18n.ts";
import type { DriverLocale } from "./translations.ts";

const STORAGE_KEY = "trinetra.driver.prefs";
const SESSION_KEY = "trinetra.driver.activeTransactionId";

export type DriverPreferences = {
  language: DriverLocale;
  languageChosen: boolean;
  voiceEnabled: boolean;
  audioEnabled: boolean;
};

export function defaultDriverPreferences(fallbackLanguage: DriverLocale = "en"): DriverPreferences {
  return {
    language: fallbackLanguage,
    languageChosen: false,
    voiceEnabled: true,
    audioEnabled: true,
  };
}

export function readDriverPreferences(fallbackLanguage: DriverLocale = "en"): DriverPreferences {
  if (typeof window === "undefined") {
    return defaultDriverPreferences(fallbackLanguage);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultDriverPreferences(fallbackLanguage);
    }
    const parsed = JSON.parse(raw) as Partial<DriverPreferences>;
    return {
      language: resolveLocale(parsed.language, fallbackLanguage),
      languageChosen: parsed.languageChosen === true,
      voiceEnabled: parsed.voiceEnabled !== false,
      audioEnabled: parsed.audioEnabled !== false,
    };
  } catch {
    return defaultDriverPreferences(fallbackLanguage);
  }
}

export function writeDriverPreferences(prefs: DriverPreferences): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function readActiveTransactionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(SESSION_KEY);
}

export function writeActiveTransactionId(id: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (id === null || id === "") {
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  window.sessionStorage.setItem(SESSION_KEY, id);
}
