import {
  CATALOGS,
  EN,
  isDriverLocale,
  type DriverLocale,
  type TranslationKey,
} from "./translations.ts";

export function resolveLocale(value: string | null | undefined, fallback: DriverLocale = "en"): DriverLocale {
  if (value && isDriverLocale(value)) {
    return value;
  }
  return fallback;
}

export function translate(locale: string, key: TranslationKey): string {
  const resolved = resolveLocale(locale);
  return CATALOGS[resolved][key] ?? EN[key] ?? key;
}

export function createTranslator(locale: string): (key: TranslationKey) => string {
  return (key) => translate(locale, key);
}
