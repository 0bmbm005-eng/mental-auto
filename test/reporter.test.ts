import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildJsonReport,
  buildMarkdownReport,
  buildTerminalOutput,
  writeRequestedReports,
} from "../src/reporter.js";
import type { ScanReport } from "../src/types.js";

const tempDirs: string[] = [];

function createReport(): ScanReport {
  return {
    rootPath: "/tmp/security-checker",
    scannedAt: "2026-04-01T00:00:00.000Z",
    mode: "all",
    summary: {
      scannedFiles: 1,
      findingCount: 1,
      safeCount: 0,
      reviewCount: 1,
      blockCount: 0,
    },
    findings: [
      {
        severity: "REVIEW",
        filePath: "notes.txt",
        line: 3,
        ruleId: "review-inline-secret",
        message: "Potential secret candidate: sk-abcdefghijklmnopqrstuvwxyz1234",
        excerpt: "token=sk-abcdefghijklmnopqrstuvwxyz1234",
      },
    ],
    notes: ["Investigate sk-abcdefghijklmnopqrstuvwxyz1234 before publishing."],
  };
}

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("reporter", () => {
  it("masks terminal and markdown output", () => {
    const report = createReport();

    const terminalOutput = buildTerminalOutput(report);
    const markdownOutput = buildMarkdownReport(report);

    expect(terminalOutput).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234");
    expect(terminalOutput).toContain("sk-a****1234");
    expect(markdownOutput).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234");
    expect(markdownOutput).toContain("sk-a****1234");
  });

  it("masks JSON by default and exposes raw values only with --no-mask", () => {
    const report = createReport();

    const maskedJson = buildJsonReport(report);
    const rawJson = buildJsonReport(report, { noMask: true });

    expect(maskedJson).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234");
    expect(rawJson).toContain("sk-abcdefghijklmnopqrstuvwxyz1234");
  });

  it("writes markdown and json reports to the requested directory with the requested prefix", async () => {
    const report = createReport();
    const outputDir = await createTempDir("security-checker-report-");

    const writtenFiles = await writeRequestedReports(report.rootPath, report, {
      markdown: true,
      json: true,
      outputDir,
      reportPrefix: "custom-report",
    });

    expect(writtenFiles).toEqual([
      join(outputDir, "custom-report.md"),
      join(outputDir, "custom-report.json"),
    ]);

    const markdownOutput = await readFile(join(outputDir, "custom-report.md"), "utf8");
    const jsonOutput = await readFile(join(outputDir, "custom-report.json"), "utf8");

    expect(markdownOutput).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234");
    expect(jsonOutput).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234");
  });
});
