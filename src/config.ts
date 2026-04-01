import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DEFAULT_CONFIG, mergeConfig } from "./rules.js";
import type {
  AdditionalBlockPattern,
  AllowlistConfig,
  AllowlistMatchType,
  AllowlistPathEntry,
  PathPatternCombination,
  SecurityRulesConfig,
} from "./types.js";

interface ConfigOverrides {
  schemaVersion?: string;
  ignorePaths?: string[];
  blockFileNames?: string[];
  reviewFileNames?: string[];
  requiredGitignoreEntries?: string[];
  blockPatterns?: string[];
  reviewPatterns?: string[];
  additionalBlockPatterns?: AdditionalBlockPattern[];
  allowlist?: Partial<AllowlistConfig>;
  maxFileSizeBytes?: number;
  reportPrefix?: string;
}

function validateStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid config field "${fieldName}". Expected string array.`);
  }

  return value;
}

function validatePositiveInteger(value: unknown, fieldName: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `Invalid config field "${fieldName}". Expected positive integer.`,
    );
  }

  return value;
}

function validatePathCombination(value: unknown): PathPatternCombination {
  if (value !== "OR" && value !== "AND") {
    throw new Error(
      'Invalid config field "allowlist.pathPatternCombination". Expected "OR" or "AND".',
    );
  }

  return value;
}

function validateMatchType(value: unknown): AllowlistMatchType {
  if (value !== "glob" && value !== "regex") {
    throw new Error(
      'Invalid config field "allowlist.paths[].matchType". Expected "glob" or "regex".',
    );
  }

  return value;
}

function validateAllowlistPathEntry(
  value: unknown,
  fieldName: string,
): AllowlistPathEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid config field "${fieldName}". Expected object.`);
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.pattern !== "string") {
    throw new Error(`Invalid config field "${fieldName}.pattern". Expected string.`);
  }

  return {
    pattern: candidate.pattern,
    matchType: validateMatchType(candidate.matchType),
  };
}

function normalizeLegacyAllowlist(value: string[]): Partial<AllowlistConfig> {
  return {
    paths: value.map((pattern) => ({ pattern, matchType: "glob" as const })),
  };
}

function validateAllowlistShape(value: unknown): Partial<AllowlistConfig> {
  if (Array.isArray(value)) {
    return normalizeLegacyAllowlist(validateStringArray(value, "allowlist"));
  }

  if (value === null || typeof value !== "object") {
    throw new Error('Invalid config field "allowlist". Expected object or string array.');
  }

  const candidate = value as Record<string, unknown>;
  const allowlist: Partial<AllowlistConfig> = {};

  if ("paths" in candidate) {
    if (!Array.isArray(candidate.paths)) {
      throw new Error('Invalid config field "allowlist.paths". Expected array.');
    }

    allowlist.paths = candidate.paths.map((entry, index) =>
      validateAllowlistPathEntry(entry, `allowlist.paths[${index}]`),
    );
  }

  if ("pathPatternCombination" in candidate) {
    allowlist.pathPatternCombination = validatePathCombination(
      candidate.pathPatternCombination,
    );
  }

  if ("patterns" in candidate) {
    allowlist.patterns = validateStringArray(
      candidate.patterns,
      "allowlist.patterns",
    );
  }

  return allowlist;
}

function validateAdditionalBlockPatterns(value: unknown): AdditionalBlockPattern[] {
  if (!Array.isArray(value)) {
    throw new Error(
      'Invalid config field "additionalBlockPatterns". Expected array.',
    );
  }

  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `Invalid config field "additionalBlockPatterns[${index}]". Expected object.`,
      );
    }

    const candidate = entry as Record<string, unknown>;

    if (typeof candidate.name !== "string") {
      throw new Error(
        `Invalid config field "additionalBlockPatterns[${index}].name". Expected string.`,
      );
    }

    if (typeof candidate.pattern !== "string") {
      throw new Error(
        `Invalid config field "additionalBlockPatterns[${index}].pattern". Expected string.`,
      );
    }

    return {
      name: candidate.name,
      pattern: candidate.pattern,
    };
  });
}

function validateConfigShape(raw: unknown): ConfigOverrides {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Config file must be a JSON object.");
  }

  const candidate = raw as Record<string, unknown>;
  const config: ConfigOverrides = {};

  if ("schemaVersion" in candidate) {
    if (typeof candidate.schemaVersion !== "string") {
      throw new Error('Invalid config field "schemaVersion". Expected string.');
    }

    config.schemaVersion = candidate.schemaVersion;
  }

  if ("ignorePaths" in candidate) {
    config.ignorePaths = validateStringArray(candidate.ignorePaths, "ignorePaths");
  }

  if ("blockFileNames" in candidate) {
    config.blockFileNames = validateStringArray(
      candidate.blockFileNames,
      "blockFileNames",
    );
  }

  if ("reviewFileNames" in candidate) {
    config.reviewFileNames = validateStringArray(
      candidate.reviewFileNames,
      "reviewFileNames",
    );
  }

  if ("requiredGitignoreEntries" in candidate) {
    config.requiredGitignoreEntries = validateStringArray(
      candidate.requiredGitignoreEntries,
      "requiredGitignoreEntries",
    );
  }

  if ("blockPatterns" in candidate) {
    config.blockPatterns = validateStringArray(
      candidate.blockPatterns,
      "blockPatterns",
    );
  }

  if ("reviewPatterns" in candidate) {
    config.reviewPatterns = validateStringArray(
      candidate.reviewPatterns,
      "reviewPatterns",
    );
  }

  if ("additionalBlockPatterns" in candidate) {
    config.additionalBlockPatterns = validateAdditionalBlockPatterns(
      candidate.additionalBlockPatterns,
    );
  }

  if ("allowlist" in candidate) {
    config.allowlist = validateAllowlistShape(candidate.allowlist);
  }

  if ("maxFileSizeBytes" in candidate) {
    config.maxFileSizeBytes = validatePositiveInteger(
      candidate.maxFileSizeBytes,
      "maxFileSizeBytes",
    );
  }

  if ("reportPrefix" in candidate) {
    if (
      typeof candidate.reportPrefix !== "string" ||
      candidate.reportPrefix.trim() === ""
    ) {
      throw new Error('Invalid config field "reportPrefix". Expected non-empty string.');
    }

    config.reportPrefix = candidate.reportPrefix;
  }

  return config;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(
  rootPath: string,
  explicitConfigPath?: string,
): Promise<SecurityRulesConfig> {
  const configPath = explicitConfigPath
    ? resolve(process.cwd(), explicitConfigPath)
    : resolve(rootPath, "security-rules.json");

  if (!(await fileExists(configPath))) {
    if (explicitConfigPath) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    return DEFAULT_CONFIG;
  }

  const rawText = await readFile(configPath, "utf8");
  const parsed = JSON.parse(rawText) as unknown;

  return mergeConfig(DEFAULT_CONFIG, validateConfigShape(parsed));
}
