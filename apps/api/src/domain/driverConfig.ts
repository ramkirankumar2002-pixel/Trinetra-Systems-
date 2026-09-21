export const DRIVER_LOCALES = ["en", "hi", "te"] as const;
export type DriverLocale = (typeof DRIVER_LOCALES)[number];

export type DriverModeConfig = {
  driverModeEnabled: boolean;
  defaultLanguage: DriverLocale;
  languages: DriverLocale[];
  voiceEnabled: boolean;
  audioEnabled: boolean;
};

export function isDriverLocale(value: string): value is DriverLocale {
  return (DRIVER_LOCALES as readonly string[]).includes(value);
}

export function resolveDriverConfig(input: {
  driverModeEnabled: boolean;
  defaultLanguage: string;
  languages: string[];
  voiceEnabled: boolean;
  audioEnabled: boolean;
}): DriverModeConfig {
  const languages = input.languages.filter(isDriverLocale);
  const available = languages.length > 0 ? languages : [...DRIVER_LOCALES];
  const defaultLanguage = isDriverLocale(input.defaultLanguage) && available.includes(input.defaultLanguage)
    ? input.defaultLanguage
    : available[0] ?? "en";

  return {
    driverModeEnabled: input.driverModeEnabled,
    defaultLanguage,
    languages: available,
    voiceEnabled: input.voiceEnabled,
    audioEnabled: input.audioEnabled,
  };
}
