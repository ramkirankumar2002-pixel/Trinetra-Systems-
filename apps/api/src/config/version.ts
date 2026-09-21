export const APP_NAME = "Trinetra Systems";
export const APP_VERSION = "1.0.0";
export const APP_RELEASE_LABEL = "V1.0";
export const API_VERSION = "v1";

export function publicVersionPayload(): {
  product: string;
  version: string;
  release: string;
  api: string;
} {
  return {
    product: APP_NAME,
    version: APP_VERSION,
    release: APP_RELEASE_LABEL,
    api: API_VERSION,
  };
}
