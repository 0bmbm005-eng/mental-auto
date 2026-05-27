import { readFile, stat } from "node:fs/promises";

const MASKED_EMAIL = "[masked-email]";
const MASKED_API_KEY = "[masked-api-key]";
const MASKED_PATH = "[masked-path]";
const LONG_LINE_LIMIT = 160;

export async function resolveSafeShareInput(input: string): Promise<string> {
  try {
    const targetStat = await stat(input);
    if (targetStat.isFile()) {
      return await readFile(input, "utf8");
    }
  } catch {
    return input;
  }

  return input;
}

export function sanitizeForSafeShare(input: string): string {
  const normalizedInput = input.replace(/\r\n/g, "\n");

  const masked = [
    maskEmails,
    maskApiKeys,
    maskLocalPaths,
    normalizeWhitespace,
    truncateLongLines,
  ].reduce((value, transform) => transform(value), normalizedInput);

  return masked.trim();
}

function maskEmails(input: string): string {
  return input.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    MASKED_EMAIL,
  );
}

function maskApiKeys(input: string): string {
  return input
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, MASKED_API_KEY)
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, MASKED_API_KEY)
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, MASKED_API_KEY)
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g, MASKED_API_KEY)
    .replace(/(\b(?:API_KEY|ACCESS_TOKEN|SECRET_KEY)\s*[:=]\s*)([^\s]+)/gi, `$1${MASKED_API_KEY}`)
    .replace(/(\bAuthorization:\s*Bearer\s+)([^\s]+)/gi, `$1${MASKED_API_KEY}`);
}

function maskLocalPaths(input: string): string {
  return input
    .replace(/\/Users\/[^\s"'`]+/g, MASKED_PATH)
    .replace(/\/home\/[^\s"'`]+/g, MASKED_PATH)
    .replace(/\/private\/[^\s"'`]+/g, MASKED_PATH)
    .replace(/\/tmp\/[^\s"'`]+/g, MASKED_PATH)
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, MASKED_PATH);
}

function normalizeWhitespace(input: string): string {
  return input
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/\t/g, "  "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function truncateLongLines(input: string): string {
  return input
    .split("\n")
    .map((line) => {
      if (line.length <= LONG_LINE_LIMIT) {
        return line;
      }

      return `${line.slice(0, LONG_LINE_LIMIT)} ... [truncated]`;
    })
    .join("\n");
}
