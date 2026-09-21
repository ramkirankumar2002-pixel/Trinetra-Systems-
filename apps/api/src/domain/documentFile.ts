const EXECUTABLE_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "dll",
  "scr",
  "pif",
  "cpl",
  "jar",
  "js",
  "mjs",
  "cjs",
  "ps1",
  "psm1",
  "vbs",
  "vbe",
  "wsf",
  "wsh",
  "sh",
  "bash",
  "bin",
  "app",
  "dmg",
  "php",
  "py",
]);

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedDocumentMime = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export type DocumentFileLimits = {
  maxBytes: number;
};

export const DEFAULT_DOCUMENT_FILE_LIMITS: DocumentFileLimits = {
  maxBytes: 10 * 1024 * 1024,
};

export type ValidatedDocumentFile = {
  originalFileName: string;
  safeFileName: string;
  mimeType: AllowedDocumentMime;
  sizeBytes: number;
};

export function sanitizeOriginalFileName(input: string): string {
  const trimmed = input.trim().replace(/\\/g, "/");
  const base = trimmed.split("/").pop() ?? "";
  const withoutControl = base.replace(/[\u0000-\u001f\u007f]/g, "");
  const collapsed = withoutControl.replace(/\s+/g, " ").trim();
  if (collapsed === "" || collapsed === "." || collapsed === "..") {
    return "document";
  }

  return collapsed.slice(0, 180);
}

export function fileExtension(fileName: string): string {
  const sanitized = sanitizeOriginalFileName(fileName);
  const index = sanitized.lastIndexOf(".");
  if (index <= 0 || index === sanitized.length - 1) {
    return "";
  }

  return sanitized.slice(index + 1).toLowerCase();
}

export function isExecutableFileName(fileName: string): boolean {
  return EXECUTABLE_EXTENSIONS.has(fileExtension(fileName));
}

export function detectDocumentMime(buffer: Buffer, declaredMime: string): AllowedDocumentMime | null {
  const sniffed = sniffDocumentMime(buffer);
  if (!sniffed) {
    return null;
  }

  const normalizedDeclared = normalizeDeclaredMime(declaredMime);
  if (normalizedDeclared && sniffed !== normalizedDeclared) {
    return null;
  }

  return sniffed;
}

export function validateDocumentFile(
  input: {
    originalFileName: string;
    declaredMimeType: string;
    buffer: Buffer;
  },
  limits: DocumentFileLimits = DEFAULT_DOCUMENT_FILE_LIMITS,
): ValidatedDocumentFile | string {
  const originalFileName = sanitizeOriginalFileName(input.originalFileName);
  if (originalFileName === "document" && input.originalFileName.trim() === "") {
    return "A file name is required";
  }

  if (isExecutableFileName(originalFileName)) {
    return "Executable files cannot be uploaded as business documents";
  }

  if (input.buffer.length === 0) {
    return "The uploaded file is empty";
  }

  if (input.buffer.length > limits.maxBytes) {
    return `File must be ${formatMaxBytes(limits.maxBytes)} or smaller`;
  }

  const mimeType = detectDocumentMime(input.buffer, input.declaredMimeType);
  if (!mimeType) {
    return "Only PDF, JPEG, PNG, or WEBP documents are allowed";
  }

  return {
    originalFileName,
    safeFileName: toSafeStorageFileName(originalFileName, mimeType),
    mimeType,
    sizeBytes: input.buffer.length,
  };
}

export function toSafeStorageFileName(originalFileName: string, mimeType: AllowedDocumentMime): string {
  const ext = extensionForMime(mimeType);
  const stem = sanitizeOriginalFileName(originalFileName)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${stem === "" ? "document" : stem}.${ext}`;
}

function normalizeDeclaredMime(value: string): AllowedDocumentMime | null {
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime === "image/jpg") {
    return "image/jpeg";
  }

  return ALLOWED_DOCUMENT_MIME_TYPES.find((allowed) => allowed === mime) ?? null;
}

function sniffDocumentMime(buffer: Buffer): AllowedDocumentMime | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function formatMaxBytes(maxBytes: number): string {
  if (maxBytes < 1024) {
    return `${maxBytes} bytes`;
  }
  if (maxBytes < 1024 * 1024) {
    return `${Math.floor(maxBytes / 1024)} KB`;
  }
  return `${Math.floor(maxBytes / (1024 * 1024))} MB`;
}

function extensionForMime(mimeType: AllowedDocumentMime): string {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default: {
      const exhaustive: never = mimeType;
      return exhaustive;
    }
  }
}
