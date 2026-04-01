import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { maskReport } from "./masker.js";
import type { ScanReport, Severity } from "./types.js";

interface TerminalOutputOptions {
  quiet?: boolean;
}

interface JsonReportOptions {
  noMask?: boolean;
}

interface ReportWriteOptions extends JsonReportOptions {
  markdown?: boolean;
  json?: boolean;
  outputDir?: string;
  reportPrefix?: string;
}

function formatFindingsSection(
  report: ScanReport,
  severity: Exclude<Severity, "SAFE">,
): string[] {
  const sectionFindings = report.findings.filter(
    (finding) => finding.severity === severity,
  );

  if (sectionFindings.length === 0) {
    return [`## ${severity}`, "- none"];
  }

  return [
    `## ${severity}`,
    ...sectionFindings.flatMap((finding) => {
      const lines = [`- file: ${finding.filePath}`];

      lines.push(`  - reason: ${finding.message}`);

      if (finding.line !== undefined) {
        lines.push(`  - line: ${finding.line}`);
      }

      if (finding.excerpt !== undefined) {
        lines.push(`  - excerpt: ${finding.excerpt}`);
      }

      return lines;
    }),
  ];
}

export function buildTerminalOutput(
  report: ScanReport,
  options: TerminalOutputOptions = {},
): string {
  const maskedReport = maskReport(report);
  const summary = [
    "Security Check Report",
    `Path: ${maskedReport.rootPath}`,
    `Mode: ${maskedReport.mode}`,
    "",
    "Summary",
    `- scanned files: ${maskedReport.summary.scannedFiles}`,
    `- findings: ${maskedReport.summary.findingCount}`,
    `- safe: ${maskedReport.summary.safeCount}`,
    `- review: ${maskedReport.summary.reviewCount}`,
    `- block: ${maskedReport.summary.blockCount}`,
  ];

  if (options.quiet) {
    return "";
  }

  const findings =
    maskedReport.findings.length === 0
      ? ["", "Findings", "- none"]
      : [
          "",
          "Findings",
          ...maskedReport.findings.map((finding) => {
            const position = finding.line === undefined ? "" : `:${finding.line}`;
            const excerpt =
              finding.excerpt === undefined ? "" : ` | ${finding.excerpt}`;

            return `- [${finding.severity}] ${finding.filePath}${position} ${finding.message}${excerpt}`;
          }),
        ];

  const notes =
    maskedReport.notes.length === 0
      ? []
      : ["", "Notes", ...maskedReport.notes.map((note) => `- ${note}`)];

  return [...summary, ...findings, ...notes].join("\n");
}

export function buildMarkdownReport(report: ScanReport): string {
  const maskedReport = maskReport(report);

  return [
    "# Security Check Report",
    "",
    "## Summary",
    `- scanned files: ${maskedReport.summary.scannedFiles}`,
    `- findings: ${maskedReport.summary.findingCount}`,
    `- safe: ${maskedReport.summary.safeCount}`,
    `- review: ${maskedReport.summary.reviewCount}`,
    `- block: ${maskedReport.summary.blockCount}`,
    "",
    ...formatFindingsSection(maskedReport, "BLOCK"),
    "",
    ...formatFindingsSection(maskedReport, "REVIEW"),
    "",
    "## Notes",
    "- This report is a pre-review aid and does not guarantee safety.",
    ...maskedReport.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}

export function buildJsonReport(
  report: ScanReport,
  options: JsonReportOptions = {},
): string {
  const output = options.noMask ? report : maskReport(report);

  return JSON.stringify(output, null, 2);
}

export async function writeRequestedReports(
  rootPath: string,
  report: ScanReport,
  options: ReportWriteOptions,
): Promise<string[]> {
  const writtenFiles: string[] = [];
  const outputDir = resolve(options.outputDir ?? rootPath);
  const reportPrefix = options.reportPrefix ?? "security-report";

  await mkdir(outputDir, { recursive: true });

  if (options.markdown) {
    const markdownPath = resolve(outputDir, `${reportPrefix}.md`);
    await writeFile(markdownPath, buildMarkdownReport(report), "utf8");
    writtenFiles.push(markdownPath);
  }

  if (options.json) {
    const jsonPath = resolve(outputDir, `${reportPrefix}.json`);
    await writeFile(
      jsonPath,
      buildJsonReport(report, { noMask: options.noMask }),
      "utf8",
    );
    writtenFiles.push(jsonPath);
  }

  return writtenFiles;
}
