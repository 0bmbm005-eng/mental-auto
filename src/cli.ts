import { resolve } from "node:path";

import { loadConfig } from "./config.js";
import { buildTerminalOutput, writeRequestedReports } from "./reporter.js";
import { scanProject } from "./scanner.js";
import type { CliOptions, ScanReport } from "./types.js";

function readNextValue(args: string[], index: number, optionName: string): string {
  const value = args[index + 1];

  if (value === undefined) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${optionName}: ${value}`);
  }

  return parsed;
}

export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    path: process.cwd(),
    outputDir: process.cwd(),
    report: false,
    json: false,
    staged: false,
    strict: false,
    quiet: false,
    concurrency: 4,
    skipLarge: false,
    noMask: false,
    enabledRules: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--path") {
      options.path = readNextValue(args, index, "--path");
      index += 1;
      continue;
    }

    if (arg === "--config") {
      options.configPath = readNextValue(args, index, "--config");
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = readNextValue(args, index, "--output-dir");
      index += 1;
      continue;
    }

    if (arg === "--concurrency") {
      options.concurrency = parsePositiveInteger(
        readNextValue(args, index, "--concurrency"),
        "--concurrency",
      );
      index += 1;
      continue;
    }

    if (arg === "--enable-rule") {
      options.enabledRules.push(readNextValue(args, index, "--enable-rule"));
      index += 1;
      continue;
    }

    if (arg === "--report") {
      options.report = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--staged") {
      options.staged = true;
      continue;
    }

    if (arg === "--strict") {
      options.strict = true;
      continue;
    }

    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }

    if (arg === "--skip-large") {
      options.skipLarge = true;
      continue;
    }

    if (arg === "--no-mask") {
      options.noMask = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export function determineExitCode(report: ScanReport, strict: boolean): number {
  if (report.summary.blockCount > 0) {
    return 1;
  }

  if (strict && report.summary.reviewCount > 0) {
    return 3;
  }

  return 0;
}

export async function runCli(args = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseCliArgs(args);
    const rootPath = resolve(options.path);
    const outputDir = resolve(options.outputDir);
    const config = await loadConfig(rootPath, options.configPath);
    const report = await scanProject({
      rootPath,
      config,
      staged: options.staged,
      concurrency: options.concurrency,
      skipLarge: options.skipLarge,
      enabledRules: options.enabledRules,
    });
    const terminalOutput = buildTerminalOutput(report, { quiet: options.quiet });

    if (!options.quiet && terminalOutput !== "") {
      console.log(terminalOutput);
    }

    const writtenFiles = await writeRequestedReports(rootPath, report, {
      markdown: options.report,
      json: options.json,
      outputDir,
      reportPrefix: config.reportPrefix,
      noMask: options.noMask,
    });

    if (!options.quiet && writtenFiles.length > 0) {
      console.log(`\nWrote reports:\n- ${writtenFiles.join("\n- ")}`);
    }

    return determineExitCode(report, options.strict);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Security check failed: ${message}`);
    return 2;
  }
}
