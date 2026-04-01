import { basename, relative, resolve, sep } from "node:path";

import type { AllowlistConfig, AllowlistPathEntry, Finding, Severity } from "./types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  SAFE: 0,
  REVIEW: 1,
  BLOCK: 2,
};

export function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

export function toRelativePath(rootPath: string, filePath: string): string {
  return normalizePath(relative(rootPath, filePath));
}

export function isPathWithin(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = resolve(rootPath);
  const resolvedTarget = resolve(targetPath);
  const relativePath = relative(resolvedRoot, resolvedTarget);

  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !relativePath.includes(`..${sep}`) &&
    !relativePath.startsWith("/")
  );
}

export function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegExp(pattern: string): RegExp {
  const escaped = escapeRegExp(pattern).replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`, "i");
}

export function fileMatchesPattern(
  relativePath: string,
  pattern: string,
): boolean {
  const normalizedPattern = normalizePath(pattern.replace(/\/+$/, ""));
  const normalizedPath = normalizePath(relativePath);
  const baseName = basename(normalizedPath);
  const matcher = globToRegExp(normalizedPattern);

  if (normalizedPattern.includes("/")) {
    return matcher.test(normalizedPath);
  }

  return matcher.test(baseName);
}

export function shouldIgnorePath(
  relativePath: string,
  ignorePaths: string[],
): boolean {
  const normalizedPath = normalizePath(relativePath);
  const segments = normalizedPath.split("/").filter(Boolean);

  return ignorePaths.some((entry) => {
    const normalizedEntry = normalizePath(entry.replace(/^\.\/+/, ""))
      .replace(/\/+$/, "")
      .trim();

    if (normalizedEntry === "") {
      return false;
    }

    if (normalizedEntry.includes("/")) {
      return (
        normalizedPath === normalizedEntry ||
        normalizedPath.startsWith(`${normalizedEntry}/`)
      );
    }

    return segments.includes(normalizedEntry);
  });
}

export function truncateExcerpt(value: string, maxLength = 160): string {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3)}...`;
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = [
      finding.severity,
      finding.filePath,
      finding.line ?? "",
      finding.ruleId,
      finding.excerpt ?? "",
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    const severityDiff =
      SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];

    if (severityDiff !== 0) {
      return severityDiff;
    }

    const pathDiff = left.filePath.localeCompare(right.filePath);

    if (pathDiff !== 0) {
      return pathDiff;
    }

    return (left.line ?? 0) - (right.line ?? 0);
  });
}

export function higherSeverity(left: Severity, right: Severity): Severity {
  return SEVERITY_RANK[left] >= SEVERITY_RANK[right] ? left : right;
}

export function applyFindingSeverityPriority(findings: Finding[]): Finding[] {
  const highestSeverityByFile = new Map<string, Severity>();

  for (const finding of findings) {
    highestSeverityByFile.set(
      finding.filePath,
      higherSeverity(
        highestSeverityByFile.get(finding.filePath) ?? "SAFE",
        finding.severity,
      ),
    );
  }

  return findings.filter(
    (finding) => finding.severity === highestSeverityByFile.get(finding.filePath),
  );
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function uniqueBy<T>(
  values: T[],
  getKey: (value: T) => string,
): T[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = getKey(value);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function allowlistPathMatches(
  filePath: string,
  rule: AllowlistPathEntry,
): boolean {
  if (rule.matchType === "glob") {
    return fileMatchesPattern(filePath, rule.pattern);
  }

  try {
    return new RegExp(rule.pattern, "u").test(normalizePath(filePath));
  } catch {
    return false;
  }
}

function matchesAllowlistPaths(
  filePath: string,
  allowlist: AllowlistConfig,
): boolean {
  if (allowlist.paths.length === 0) {
    return false;
  }

  if (allowlist.pathPatternCombination === "AND") {
    return allowlist.paths.every((rule) => allowlistPathMatches(filePath, rule));
  }

  return allowlist.paths.some((rule) => allowlistPathMatches(filePath, rule));
}

function matchesAllowlistPatterns(
  finding: Finding,
  allowlist: AllowlistConfig,
): boolean {
  if (allowlist.patterns.length === 0) {
    return false;
  }

  const haystacks = [finding.message, finding.excerpt ?? ""];

  return allowlist.patterns.some((pattern) =>
    haystacks.some((haystack) => haystack.includes(pattern)),
  );
}

export function isAllowlisted(
  finding: Finding,
  allowlist: AllowlistConfig,
): boolean {
  return (
    matchesAllowlistPaths(finding.filePath, allowlist) ||
    matchesAllowlistPatterns(finding, allowlist)
  );
}

export function isProbablyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let suspiciousBytes = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    const isPrintable =
      byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126);

    if (!isPrintable) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes / sample.length > 0.3;
}
