import type { IncomingMessage } from "node:http";
import { HttpError } from "../../lib/httpError.js";

export type UploadedMultipartFile = {
  fieldName: string;
  originalFileName: string;
  mimeType: string;
  buffer: Buffer;
};

export type ParsedDocumentUpload = {
  fields: Record<string, string>;
  file: UploadedMultipartFile;
};

export async function parseDocumentUpload(
  request: IncomingMessage,
  maxBytes: number,
): Promise<ParsedDocumentUpload> {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !contentType.toLowerCase().includes("multipart/form-data")) {
    throw new HttpError(400, "A document file is required");
  }

  const boundary = readBoundary(contentType);
  if (!boundary) {
    throw new HttpError(400, "A document file is required");
  }

  const body = await readLimitedBody(request, maxBytes + 64 * 1024);
  const parts = splitMultipart(body, boundary);
  const fields: Record<string, string> = {};
  let file: UploadedMultipartFile | null = null;

  for (const part of parts) {
    const headerEnd = indexOfBuffer(part, Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      continue;
    }

    const headers = part.subarray(0, headerEnd).toString("utf8");
    const content = part.subarray(headerEnd + 4);
    const disposition = readHeader(headers, "content-disposition");
    if (!disposition) {
      continue;
    }

    const fieldName = readDispositionValue(disposition, "name");
    if (!fieldName) {
      continue;
    }

    const fileName = readDispositionValue(disposition, "filename");
    if (fileName === null) {
      fields[fieldName] = content.toString("utf8").replace(/\r?\n$/, "");
      continue;
    }

    if (file) {
      throw new HttpError(400, "Upload one document at a time");
    }

    file = {
      fieldName,
      originalFileName: fileName,
      mimeType: readHeader(headers, "content-type") ?? "application/octet-stream",
      buffer: content,
    };
  }

  if (!file) {
    throw new HttpError(400, "A document file is required");
  }

  return { fields, file };
}

function readBoundary(contentType: string): string | null {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const value = match?.[1] ?? match?.[2];
  return value ? value.trim() : null;
}

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let cursor = indexOfBuffer(body, delimiter);
  if (cursor === -1) {
    return parts;
  }

  cursor += delimiter.length;
  while (cursor < body.length) {
    if (body[cursor] === 0x2d && body[cursor + 1] === 0x2d) {
      break;
    }
    if (body[cursor] === 0x0d && body[cursor + 1] === 0x0a) {
      cursor += 2;
    }

    const next = indexOfBuffer(body, delimiter, cursor);
    if (next === -1) {
      break;
    }

    let part = body.subarray(cursor, next);
    if (part.length >= 2 && part[part.length - 2] === 0x0d && part[part.length - 1] === 0x0a) {
      part = part.subarray(0, part.length - 2);
    }
    parts.push(part);
    cursor = next + delimiter.length;
  }

  return parts;
}

async function readLimitedBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new HttpError(413, "File is too large");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function readHeader(headers: string, name: string): string | null {
  const lines = headers.split(/\r\n/);
  const prefix = `${name}:`;
  for (const line of lines) {
    if (line.toLowerCase().startsWith(prefix.toLowerCase())) {
      return line.slice(prefix.length).trim();
    }
  }

  return null;
}

function readDispositionValue(disposition: string, key: string): string | null {
  const match = new RegExp(`${key}="([^"]*)"`, "i").exec(disposition);
  if (!match) {
    const unquoted = new RegExp(`${key}=([^;]+)`, "i").exec(disposition);
    return unquoted?.[1]?.trim() ?? null;
  }

  return match[1] ?? null;
}

function indexOfBuffer(haystack: Buffer, needle: Buffer, start = 0): number {
  return haystack.indexOf(needle, start);
}
