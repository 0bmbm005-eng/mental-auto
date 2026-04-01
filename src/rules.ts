import { basename } from "node:path";

import type {
  AdditionalBlockPattern,
  AllowlistConfig,
  CompiledPatternRule,
  CompiledRules,
  Finding,
  SecurityRulesConfig,
  Severity,
} from "./types.js";
import {
  fileMatchesPattern,
  normalizePath,
  truncateExcerpt,
  uniqueBy,
  uniqueStrings,
} from "./utils.js";

type PatternDefinition = Omit<CompiledPatternRule, "regex">;

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

const KNOWN_BLOCK_PATTERNS: Record<string, PatternDefinition> = {
  "sk-[A-Za-z0-9_-]{20,}": {
    source: "sk-[A-Za-z0-9_-]{20,}",
    severity: "BLOCK",
    ruleId: "block-openai-key",
    message: "Potential OpenAI API key detected.",
  },
  "ghp_[A-Za-z0-9]{20,}": {
    source: "ghp_[A-Za-z0-9]{20,}",
    severity: "BLOCK",
    ruleId: "block-github-token",
    message: "Potential GitHub personal access token detected.",
  },
  "github_pat_[A-Za-z0-9_]{20,}": {
    source: "github_pat_[A-Za-z0-9_]{20,}",
    severity: "BLOCK",
    ruleId: "block-github-fgpat",
    message: "Potential GitHub fine-grained token detected.",
  },
  "AIza[0-9A-Za-z\\-_]{20,}": {
    source: "AIza[0-9A-Za-z\\-_]{20,}",
    severity: "BLOCK",
    ruleId: "block-google-api-key",
    message: "Potential Google API key detected.",
  },
  "xox[baprs]-[A-Za-z0-9-]+": {
    source: "xox[baprs]-[A-Za-z0-9-]+",
    severity: "BLOCK",
    ruleId: "block-slack-token",
    message: "Potential Slack token detected.",
  },
  "AKIA[0-9A-Z]{16}": {
    source: "AKIA[0-9A-Z]{16}",
    severity: "BLOCK",
    ruleId: "block-aws-access-key",
    message: "Potential AWS access key detected.",
  },
};

const KNOWN_REVIEW_PATTERNS: Record<string, PatternDefinition> = {
  "\\b(?:password|passwd|pwd|api[_-]?key|secret|token)\\b\\s*[:=]\\s*(?!REDACTED\\b|YOUR_[A-Z_]+\\b|example\\b|sample\\b|dummy\\b|test\\b|changeme\\b)[^\\s\"'`]{4,}":
    {
      source:
        "\\b(?:password|passwd|pwd|api[_-]?key|secret|token)\\b\\s*[:=]\\s*(?!REDACTED\\b|YOUR_[A-Z_]+\\b|example\\b|sample\\b|dummy\\b|test\\b|changeme\\b)[^\\s\"'`]{4,}",
      severity: "REVIEW",
      ruleId: "review-inline-secret",
      message: "Potential plain-text credential assignment detected.",
    },
  "authorization\\s*:\\s*bearer\\s+[A-Za-z0-9._-]{8,}": {
    source: "authorization\\s*:\\s*bearer\\s+[A-Za-z0-9._-]{8,}",
    severity: "REVIEW",
    ruleId: "review-bearer-token",
    message: "Bearer token style header detected.",
  },
  "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}": {
    source: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
    severity: "REVIEW",
    ruleId: "review-email",
    message: "Email address detected.",
  },
  "(/Users/|C:\\\\Users\\\\|/home/)[^\\s\"']+": {
    source: "(/Users/|C:\\\\Users\\\\|/home/)[^\\s\"']+",
    severity: "REVIEW",
    ruleId: "review-local-path",
    message: "Local absolute path detected.",
  },
  "\\b(?:confidential|internal use only|社外秘|顧客名|案件名|取引先|部署名|本番障害|customer incident)\\b":
    {
      source:
        "\\b(?:confidential|internal use only|社外秘|顧客名|案件名|取引先|部署名|本番障害|customer incident)\\b",
      severity: "REVIEW",
      ruleId: "review-internal-context",
      message: "Potential internal or insufficiently anonymized wording detected.",
    },
};

const OPTIONAL_REVIEW_RULES: Record<string, PatternDefinition> = {
  "japanese-name": {
    source: "[一-龠]{2,4}[ \\u3000][一-龠]{2,4}",
    severity: "REVIEW",
    ruleId: "review-japanese-name",
    message: "Potential Japanese personal name detected.",
  },
};

const TRACKED_BLOCK_PATH_PREFIXES = ["logs/", "dist/", "node_modules/"];
const TRACKED_TEMP_PATTERNS = ["*.bak", "*.tmp", "*.swp", "*~"];
const SAFE_ENV_FILE_NAMES = new Set([".env.example", ".env.sample", ".env.template"]);
const REVIEW_ENV_FILE_NAMES = new Set([".env.local", ".env.test"]);
const BLOCK_ENV_FILE_NAMES = new Set([".env", ".env.production", ".env.secrets"]);

export const DEFAULT_CONFIG: SecurityRulesConfig = {
  schemaVersion: "1.0",
  ignorePaths: [".git", "node_modules", "dist", "coverage"],
  blockFileNames: [
    ".env",
    ".env.production",
    ".env.secrets",
    "secrets.json",
    "credentials.json",
    "service-account.json",
    "id_rsa",
    "*.pem",
    "*.key",
  ],
  reviewFileNames: [".env.local", ".env.test"],
  requiredGitignoreEntries: [
    "node_modules/",
    "dist/",
    "logs/",
    ".env",
    ".env.*",
    ".DS_Store",
    "*.log",
  ],
  blockPatterns: Object.keys(KNOWN_BLOCK_PATTERNS),
  reviewPatterns: Object.keys(KNOWN_REVIEW_PATTERNS),
  additionalBlockPatterns: [],
  allowlist: {
    paths: [],
    pathPatternCombination: "OR",
    patterns: [],
  },
  maxFileSizeBytes: 104857600,
  reportPrefix: "security-report",
};

export function getEnvFileSeverity(relativePath: string): Severity | null {
  const fileName = basename(normalizePath(relativePath));

  if (SAFE_ENV_FILE_NAMES.has(fileName)) {
    return "SAFE";
  }

  if (REVIEW_ENV_FILE_NAMES.has(fileName)) {
    return "REVIEW";
  }

  if (BLOCK_ENV_FILE_NAMES.has(fileName)) {
    return "BLOCK";
  }

  if (fileName.startsWith(".env.") && fileName.includes("production")) {
    return "BLOCK";
  }

  if (fileName.startsWith(".env.")) {
    return "BLOCK";
  }

  return null;
}

function buildEnvFileFinding(
  relativePath: string,
  severity: Severity,
): Finding | null {
  const normalizedPath = normalizePath(relativePath);
  const fileName = basename(normalizedPath);

  if (severity === "SAFE") {
    return null;
  }

  if (severity === "REVIEW") {
    return {
      severity,
      filePath: normalizedPath,
      ruleId: "review-env-file",
      message: `Environment file requires review: ${fileName}`,
    };
  }

  return {
    severity,
    filePath: normalizedPath,
    ruleId: "block-env-file",
    message: `Sensitive environment file detected: ${fileName}`,
  };
}

function toCustomRuleId(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized === "" ? "block-custom-pattern" : `block-${normalized}`;
}

function compileRule(
  source: string,
  severity: Exclude<Severity, "SAFE">,
): CompiledPatternRule | null {
  const known =
    severity === "BLOCK"
      ? KNOWN_BLOCK_PATTERNS[source]
      : KNOWN_REVIEW_PATTERNS[source];

  try {
    return {
      source,
      severity,
      ruleId: known?.ruleId ?? `${severity.toLowerCase()}-custom-pattern`,
      message:
        known?.message ??
        `Matched configured ${severity.toLowerCase()} pattern.`,
      regex: new RegExp(source, "iu"),
    };
  } catch {
    return null;
  }
}

function compileAdditionalBlockRule(
  rule: AdditionalBlockPattern,
): CompiledPatternRule | null {
  try {
    return {
      source: rule.pattern,
      severity: "BLOCK",
      ruleId: toCustomRuleId(rule.name),
      message: `Matched configured block pattern: ${rule.name}.`,
      regex: new RegExp(rule.pattern, "iu"),
    };
  } catch {
    return null;
  }
}

function compileOptionalRule(ruleName: string): CompiledPatternRule | null {
  const definition = OPTIONAL_REVIEW_RULES[ruleName];

  if (definition === undefined) {
    return null;
  }

  try {
    return {
      ...definition,
      regex: new RegExp(definition.source, "u"),
    };
  } catch {
    return null;
  }
}

export function compileRules(
  config: SecurityRulesConfig,
  enabledRules: string[] = [],
): CompiledRules {
  const optionalReviewRules = enabledRules
    .map((ruleName) => compileOptionalRule(ruleName))
    .filter((rule): rule is CompiledPatternRule => rule !== null);

  return {
    blockPatterns: [
      ...config.blockPatterns
        .map((source) => compileRule(source, "BLOCK"))
        .filter((rule): rule is CompiledPatternRule => rule !== null),
      ...config.additionalBlockPatterns
        .map((rule) => compileAdditionalBlockRule(rule))
        .filter((rule): rule is CompiledPatternRule => rule !== null),
    ],
    reviewPatterns: [
      ...config.reviewPatterns
        .map((source) => compileRule(source, "REVIEW"))
        .filter((rule): rule is CompiledPatternRule => rule !== null),
      ...optionalReviewRules,
    ],
  };
}

export function getInvalidPatternSources(
  config: SecurityRulesConfig,
  enabledRules: string[] = [],
): string[] {
  const invalidOptionalRules = enabledRules.filter(
    (ruleName) => compileOptionalRule(ruleName) === null,
  );

  return [
    ...config.blockPatterns.filter(
      (source) => compileRule(source, "BLOCK") === null,
    ),
    ...config.reviewPatterns.filter(
      (source) => compileRule(source, "REVIEW") === null,
    ),
    ...config.additionalBlockPatterns
      .filter((rule) => compileAdditionalBlockRule(rule) === null)
      .map((rule) => rule.pattern),
    ...invalidOptionalRules,
  ];
}

export function mergeConfig(
  baseConfig: SecurityRulesConfig,
  override: ConfigOverrides,
): SecurityRulesConfig {
  return {
    schemaVersion: override.schemaVersion ?? baseConfig.schemaVersion,
    ignorePaths: uniqueStrings([
      ...baseConfig.ignorePaths,
      ...(override.ignorePaths ?? []),
    ]),
    blockFileNames: uniqueStrings([
      ...baseConfig.blockFileNames,
      ...(override.blockFileNames ?? []),
    ]),
    reviewFileNames: uniqueStrings([
      ...baseConfig.reviewFileNames,
      ...(override.reviewFileNames ?? []),
    ]),
    requiredGitignoreEntries: uniqueStrings([
      ...baseConfig.requiredGitignoreEntries,
      ...(override.requiredGitignoreEntries ?? []),
    ]),
    blockPatterns: uniqueStrings([
      ...baseConfig.blockPatterns,
      ...(override.blockPatterns ?? []),
    ]),
    reviewPatterns: uniqueStrings([
      ...baseConfig.reviewPatterns,
      ...(override.reviewPatterns ?? []),
    ]),
    additionalBlockPatterns: uniqueBy(
      [
        ...baseConfig.additionalBlockPatterns,
        ...(override.additionalBlockPatterns ?? []),
      ],
      (rule) => `${rule.name}:${rule.pattern}`,
    ),
    allowlist: {
      paths: uniqueBy(
        [
          ...baseConfig.allowlist.paths,
          ...(override.allowlist?.paths ?? []),
        ],
        (rule) => `${rule.matchType}:${rule.pattern}`,
      ),
      pathPatternCombination:
        override.allowlist?.pathPatternCombination ??
        baseConfig.allowlist.pathPatternCombination,
      patterns: uniqueStrings([
        ...baseConfig.allowlist.patterns,
        ...(override.allowlist?.patterns ?? []),
      ]),
    },
    maxFileSizeBytes: override.maxFileSizeBytes ?? baseConfig.maxFileSizeBytes,
    reportPrefix: override.reportPrefix ?? baseConfig.reportPrefix,
  };
}

export function getPresenceFindings(
  relativePath: string,
  config: SecurityRulesConfig,
): Finding[] {
  const normalizedPath = normalizePath(relativePath);
  const fileName = basename(normalizedPath);
  const envSeverity = getEnvFileSeverity(normalizedPath);
  const envFinding =
    envSeverity === null ? null : buildEnvFileFinding(normalizedPath, envSeverity);

  if (envFinding !== null) {
    return [envFinding];
  }

  const findings: Finding[] = [];

  if (
    config.blockFileNames.some((pattern) =>
      fileMatchesPattern(normalizedPath, pattern),
    )
  ) {
    findings.push({
      severity: "REVIEW",
      filePath: normalizedPath,
      ruleId: "review-sensitive-file-present",
      message: `Sensitive file name present: ${fileName}`,
    });
  }

  if (
    config.reviewFileNames.some((pattern) =>
      fileMatchesPattern(normalizedPath, pattern),
    )
  ) {
    findings.push({
      severity: "REVIEW",
      filePath: normalizedPath,
      ruleId: "review-file-name",
      message: `Review file name present: ${fileName}`,
    });
  }

  return findings;
}

export function getTrackedFileFindings(
  relativePath: string,
  config: SecurityRulesConfig,
): Finding[] {
  const normalizedPath = normalizePath(relativePath);
  const fileName = basename(normalizedPath);
  const envSeverity = getEnvFileSeverity(normalizedPath);
  const findings: Finding[] = [];

  if (
    TRACKED_BLOCK_PATH_PREFIXES.some(
      (prefix) =>
        normalizedPath === prefix.slice(0, -1) ||
        normalizedPath.startsWith(prefix),
    )
  ) {
    findings.push({
      severity: "BLOCK",
      filePath: normalizedPath,
      ruleId: "block-tracked-generated-or-log-file",
      message: `Tracked file is inside a non-public directory: ${normalizedPath}`,
    });
  }

  if (envSeverity === "BLOCK" || envSeverity === "REVIEW") {
    findings.push({
      severity: "BLOCK",
      filePath: normalizedPath,
      ruleId: "block-tracked-env-file",
      message: `Environment file is tracked by Git: ${fileName}`,
    });
  }

  if (
    envSeverity === null &&
    config.blockFileNames.some((pattern) =>
      fileMatchesPattern(normalizedPath, pattern),
    )
  ) {
    findings.push({
      severity: "BLOCK",
      filePath: normalizedPath,
      ruleId: "block-tracked-sensitive-file",
      message: `Sensitive file is tracked by Git: ${fileName}`,
    });
  }

  if (
    envSeverity === null &&
    TRACKED_TEMP_PATTERNS.some((pattern) =>
      fileMatchesPattern(normalizedPath, pattern),
    )
  ) {
    findings.push({
      severity: "BLOCK",
      filePath: normalizedPath,
      ruleId: "block-tracked-temp-file",
      message: `Temporary or backup file is tracked by Git: ${fileName}`,
    });
  }

  return findings;
}

export function getGitignoreFindings(
  gitignoreContent: string | null,
  config: SecurityRulesConfig,
): Finding[] {
  if (gitignoreContent === null) {
    return config.requiredGitignoreEntries.map((entry) => ({
      severity: "REVIEW",
      filePath: ".gitignore",
      ruleId: "review-missing-gitignore",
      message: `Recommended .gitignore entry is missing: ${entry}`,
    }));
  }

  const entries = new Set(
    gitignoreContent
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#")),
  );

  return config.requiredGitignoreEntries
    .filter((entry) => !entries.has(entry))
    .map((entry) => ({
      severity: "REVIEW" as const,
      filePath: ".gitignore",
      ruleId: "review-missing-gitignore-entry",
      message: `Recommended .gitignore entry is missing: ${entry}`,
    }));
}

export function scanLine(
  relativePath: string,
  lineNumber: number,
  line: string,
  compiledRules: CompiledRules,
): Finding[] {
  const findings: Finding[] = [];
  const trimmedLine = truncateExcerpt(line);

  for (const rule of [
    ...compiledRules.blockPatterns,
    ...compiledRules.reviewPatterns,
  ]) {
    rule.regex.lastIndex = 0;

    if (!rule.regex.test(line)) {
      continue;
    }

    findings.push({
      severity: rule.severity,
      filePath: normalizePath(relativePath),
      line: lineNumber,
      ruleId: rule.ruleId,
      message: rule.message,
      excerpt: trimmedLine,
    });
  }

  return findings;
}
