import { HttpError } from "../../lib/httpError.js";

export type LoginInput = {
  email: string;
  password: string;
  organizationSlug?: string;
};

export function parseLoginInput(body: unknown): LoginInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Email and password are required");
  }

  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const slugRaw =
    typeof record.organizationSlug === "string"
      ? record.organizationSlug.trim().toLowerCase()
      : typeof record.organization === "string"
        ? record.organization.trim().toLowerCase()
        : "";

  if (email === "" || !email.includes("@")) {
    throw new HttpError(400, "A valid email is required");
  }

  if (password.length === 0 || password.length > 72) {
    throw new HttpError(400, "A valid password is required");
  }

  if (slugRaw !== "" && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slugRaw)) {
    throw new HttpError(400, "A valid organization is required");
  }

  return {
    email,
    password,
    ...(slugRaw === "" ? {} : { organizationSlug: slugRaw }),
  };
}

export function parseActiveSiteInput(body: unknown): { siteId: string } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A site is required");
  }
  const record = body as Record<string, unknown>;
  const siteId = typeof record.siteId === "string" ? record.siteId.trim() : "";
  if (siteId === "") {
    throw new HttpError(400, "A site is required");
  }
  return { siteId };
}
