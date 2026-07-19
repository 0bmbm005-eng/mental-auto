import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatHelp,
  getJstDateString,
  renderLog,
  runCli,
  writeLogFile,
} from "../src/index.js";

describe("getJstDateString", () => {
  it("formats a date in JST as YYYY-MM-DD", () => {
    const utc = new Date("2026-03-25T18:30:00.000Z");

    expect(getJstDateString(utc)).toBe("2026-03-26");
  });
});

describe("renderLog", () => {
  it("renders the date and memo", () => {
    expect(renderLog("メモ内容", "2026-03-26")).toBe(
      "# 2026-03-26\n\nメモ内容\n",
    );
  });

  it("accepts an empty memo", () => {
    expect(renderLog("", "2026-03-26")).toBe(
      "# 2026-03-26\n\n_No memo provided_\n",
    );
  });
});

describe("formatHelp", () => {
  it("shows usage, examples, and unimplemented options", () => {
    expect(formatHelp()).toContain("Usage:");
    expect(formatHelp()).toContain("--date YYYY-MM-DD");
    expect(formatHelp()).toContain("--memo TEXT");
    expect(formatHelp()).toContain("--import-mobile X");
    expect(formatHelp()).toContain("--dry-run");
    expect(formatHelp()).toContain("--safe-share INPUT");
    expect(formatHelp()).toContain("Examples:");
    expect(formatHelp()).toContain("same-day append is not implemented");
    expect(formatHelp()).toContain("mirror-logs/: not implemented");
    expect(formatHelp()).toContain("--mirror-advice");
  });
});

describe("runCli help", () => {
  it("returns help mode when --help is passed", async () => {
    await expect(runCli(["--help"])).resolves.toEqual({
      filePath: null,
      help: true,
      safeShareText: null,
      mobileImportPlans: null,
      dryRun: false,
    });
  });
});

describe("writeLogFile", () => {
  it("creates the logs directory and writes the file", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    const content = renderLog("テスト", "2026-03-26");
    const filePath = await writeLogFile("2026-03-26", content, baseDir);

    await expect(readFile(filePath, "utf8")).resolves.toBe(content);
  });
});

describe("runCli", () => {
  it("writes a log file to a custom output directory", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    const result = await runCli([
      "--date",
      "2026-03-26",
      "--memo",
      "今日は",
      "--output-dir",
      baseDir,
      "少し",
      "疲れた",
    ]);

    expect(result).toEqual({
      filePath: join(baseDir, "logs", "2026-03-26.md"),
      help: false,
      safeShareText: null,
      mobileImportPlans: null,
      dryRun: false,
    });

    if (result.filePath === null) {
      throw new Error("Expected a file path");
    }

    await expect(readFile(result.filePath, "utf8")).resolves.toContain("今日は");
  });

  it("uses only --memo when it is specified", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    const result = await runCli([
      "--memo",
      "専用メモ",
      "ignored",
      "--date",
      "2026-03-26",
      "--output-dir",
      baseDir,
    ]);

    expect(result.filePath).not.toBeNull();
    expect(result.filePath !== null && isAbsolute(result.filePath)).toBe(true);

    if (result.filePath === null) {
      throw new Error("Expected a file path");
    }

    await expect(readFile(result.filePath, "utf8")).resolves.toContain("専用メモ");
    await expect(readFile(result.filePath, "utf8")).resolves.not.toContain("ignored");
  });

  it("rejects an invalid date", async () => {
    await expect(runCli(["--date", "2026-13-01"])).rejects.toThrow(
      "Invalid value for --date: 2026-13-01",
    );
  });

  it("prints sanitized safe-share text from a direct string", async () => {
    const result = await runCli([
      "--safe-share",
      " user@example.com  sk-1234567890abcdef1234567890 /Users/example/mental-auto/logs/2026-03-26.md   ",
    ]);

    expect(result).toEqual({
      filePath: null,
      help: false,
      safeShareText: "[masked-email]  [masked-api-key] [masked-path]",
      mobileImportPlans: null,
      dryRun: false,
    });
  });

  it("reads a file when --safe-share points to an existing local file", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-safe-share-"));
    const logPath = join(baseDir, "sample.md");

    await writeFile(
      logPath,
      "contact: user@example.com\npath: /Users/example/private/note.txt\n",
      "utf8",
    );

    const result = await runCli(["--safe-share", logPath]);

    expect(result).toEqual({
      filePath: null,
      help: false,
      safeShareText: "contact: [masked-email]\npath: [masked-path]",
      mobileImportPlans: null,
      dryRun: false,
    });
  });

  it("truncates long lines and normalizes extra blank lines in safe-share mode", async () => {
    const longLine = `note: ${"a".repeat(220)}`;
    const result = await runCli(["--safe-share", `line 1   \n\n\n${longLine}`]);

    expect(result.filePath).toBeNull();
    expect(result.help).toBe(false);
    expect(result.safeShareText).toContain("line 1");
    expect(result.safeShareText).toContain("[truncated]");
    expect(result.safeShareText).not.toContain("\n\n\n");
  });

  it("imports one mobile inbox file into an existing mobile notes section", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-import-"));
    const inboxDir = join(baseDir, "mobile-inbox");
    const sourcePath = join(inboxDir, "2026-06-25.md");

    await mkdir(inboxDir, { recursive: true });
    await mkdir(join(baseDir, "logs"), { recursive: true });
    await writeFile(
      join(baseDir, "logs", "2026-06-25.md"),
      "# 2026-06-25\n\nMorning log\n\n## Mobile notes\n\nExisting mobile note\n",
      "utf8",
    );
    await writeFile(sourcePath, "- bought coffee\n- felt better\n", "utf8");

    const result = await runCli(["--import-mobile", sourcePath, "--output-dir", baseDir]);

    expect(result.filePath).toBeNull();
    expect(result.help).toBe(false);
    expect(result.safeShareText).toBeNull();
    expect(result.dryRun).toBe(false);
    expect(result.mobileImportPlans).toEqual([
      {
        sourcePath,
        targetLogPath: join(baseDir, "logs", "2026-06-25.md"),
        archivePath: join(inboxDir, "archive", "2026-06-25.md"),
        date: "2026-06-25",
      },
    ]);

    await expect(readFile(join(baseDir, "logs", "2026-06-25.md"), "utf8")).resolves.toBe(
      "# 2026-06-25\n\nMorning log\n\n## Mobile notes\n\nExisting mobile note\n\n- bought coffee\n- felt better\n",
    );
    await expect(readFile(join(inboxDir, "archive", "2026-06-25.md"), "utf8")).resolves.toBe(
      "- bought coffee\n- felt better\n",
    );
    await expect(stat(sourcePath)).rejects.toThrow();
  });

  it("creates a Mobile notes section when the target log does not have one", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-section-"));
    const inboxDir = join(baseDir, "mobile-inbox");
    const sourcePath = join(inboxDir, "2026-06-26.md");

    await mkdir(inboxDir, { recursive: true });
    await mkdir(join(baseDir, "logs"), { recursive: true });
    await writeFile(join(baseDir, "logs", "2026-06-26.md"), "# 2026-06-26\n\nDesk note\n", "utf8");
    await writeFile(sourcePath, "Phone memo\n", "utf8");

    await runCli(["--import-mobile", sourcePath, "--output-dir", baseDir]);

    await expect(readFile(join(baseDir, "logs", "2026-06-26.md"), "utf8")).resolves.toBe(
      "# 2026-06-26\n\nDesk note\n\n## Mobile notes\n\nPhone memo\n",
    );
  });

  it("reports plans only in dry-run mode", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-dry-run-"));
    const inboxDir = join(baseDir, "mobile-inbox");
    const sourcePath = join(inboxDir, "2026-06-27.md");

    await mkdir(inboxDir, { recursive: true });
    await mkdir(join(baseDir, "logs"), { recursive: true });
    await writeFile(join(baseDir, "logs", "2026-06-27.md"), "# 2026-06-27\n\nDesk note\n", "utf8");
    await writeFile(sourcePath, "Phone memo\n", "utf8");

    const result = await runCli([
      "--import-mobile",
      inboxDir,
      "--output-dir",
      baseDir,
      "--dry-run",
    ]);

    expect(result.mobileImportPlans).toEqual([
      {
        sourcePath,
        targetLogPath: join(baseDir, "logs", "2026-06-27.md"),
        archivePath: join(inboxDir, "archive", "2026-06-27.md"),
        date: "2026-06-27",
      },
    ]);
    expect(result.dryRun).toBe(true);
    await expect(readFile(join(baseDir, "logs", "2026-06-27.md"), "utf8")).resolves.toBe(
      "# 2026-06-27\n\nDesk note\n",
    );
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("Phone memo\n");
  });

  it("imports markdown files from a directory in filename order", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-dir-"));
    const inboxDir = join(baseDir, "mobile-inbox");

    await mkdir(inboxDir, { recursive: true });
    await writeFile(join(inboxDir, "2026-06-29.md"), "Second day\n", "utf8");
    await writeFile(join(inboxDir, "2026-06-28.md"), "First day\n", "utf8");
    await writeFile(join(inboxDir, "note.txt"), "ignore me\n", "utf8");

    const result = await runCli(["--import-mobile", inboxDir, "--output-dir", baseDir]);

    expect(result.mobileImportPlans?.map((plan) => plan.date)).toEqual([
      "2026-06-28",
      "2026-06-29",
    ]);
    await expect(readFile(join(baseDir, "logs", "2026-06-28.md"), "utf8")).resolves.toBe(
      "# 2026-06-28\n\n## Mobile notes\n\nFirst day\n",
    );
    await expect(readFile(join(baseDir, "logs", "2026-06-29.md"), "utf8")).resolves.toBe(
      "# 2026-06-29\n\n## Mobile notes\n\nSecond day\n",
    );

    const archived = await readdir(join(inboxDir, "archive"));
    expect(archived).toEqual(["2026-06-28.md", "2026-06-29.md"]);
  });

  it("rejects invalid mobile inbox filenames", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-invalid-"));
    const inboxDir = join(baseDir, "mobile-inbox");

    await mkdir(inboxDir, { recursive: true });
    await writeFile(join(inboxDir, "2026-6-27.md"), "bad date\n", "utf8");

    await expect(
      runCli(["--import-mobile", join(inboxDir, "2026-6-27.md"), "--output-dir", baseDir]),
    ).rejects.toThrow("Invalid mobile inbox filename (expected YYYY-MM-DD.md): 2026-6-27.md");
  });
});
