import { pathToFileURL } from "node:url";

export { runCli, determineExitCode, parseCliArgs } from "./cli.js";
export { loadConfig } from "./config.js";
export { getGitRoot, listStagedFiles, listTrackedFiles } from "./git.js";
export { inspectGitignore } from "./gitignore-checker.js";
export { readLinesFromStream } from "./line-reader.js";
export {
  buildJsonReport,
  buildMarkdownReport,
  buildTerminalOutput,
  writeRequestedReports,
} from "./reporter.js";
export { scanProject } from "./scanner.js";
export type {
  AdditionalBlockPattern,
  AllowlistConfig,
  AllowlistMatchType,
  AllowlistPathEntry,
  CliOptions,
  CompiledPatternRule,
  CompiledRules,
  Finding,
  PathPatternCombination,
  ScanProjectOptions,
  ScanReport,
  ScanSummary,
  SecurityRulesConfig,
  Severity,
} from "./types.js";

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const { runCli } = await import("./cli.js");

  process.exitCode = await runCli();
}
