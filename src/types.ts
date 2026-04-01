export type Severity = "SAFE" | "REVIEW" | "BLOCK";
export type AllowlistMatchType = "glob" | "regex";
export type PathPatternCombination = "OR" | "AND";

export interface AdditionalBlockPattern {
  name: string;
  pattern: string;
}

export interface AllowlistPathEntry {
  pattern: string;
  matchType: AllowlistMatchType;
}

export interface AllowlistConfig {
  paths: AllowlistPathEntry[];
  pathPatternCombination: PathPatternCombination;
  patterns: string[];
}

export interface CliOptions {
  path: string;
  outputDir: string;
  configPath?: string;
  report: boolean;
  json: boolean;
  staged: boolean;
  strict: boolean;
  quiet: boolean;
  concurrency: number;
  skipLarge: boolean;
  noMask: boolean;
  enabledRules: string[];
}

export interface SecurityRulesConfig {
  schemaVersion: string;
  ignorePaths: string[];
  blockFileNames: string[];
  reviewFileNames: string[];
  requiredGitignoreEntries: string[];
  blockPatterns: string[];
  reviewPatterns: string[];
  additionalBlockPatterns: AdditionalBlockPattern[];
  allowlist: AllowlistConfig;
  maxFileSizeBytes: number;
  reportPrefix: string;
}

export interface CompiledPatternRule {
  source: string;
  severity: Exclude<Severity, "SAFE">;
  ruleId: string;
  message: string;
  regex: RegExp;
}

export interface CompiledRules {
  blockPatterns: CompiledPatternRule[];
  reviewPatterns: CompiledPatternRule[];
}

export interface Finding {
  severity: Severity;
  filePath: string;
  ruleId: string;
  message: string;
  line?: number;
  excerpt?: string;
}

export interface ScanSummary {
  scannedFiles: number;
  findingCount: number;
  safeCount: number;
  reviewCount: number;
  blockCount: number;
}

export interface ScanReport {
  rootPath: string;
  scannedAt: string;
  mode: "all" | "staged";
  summary: ScanSummary;
  findings: Finding[];
  notes: string[];
}

export interface ScanProjectOptions {
  rootPath: string;
  config: SecurityRulesConfig;
  staged?: boolean;
  concurrency?: number;
  skipLarge?: boolean;
  enabledRules?: string[];
}
