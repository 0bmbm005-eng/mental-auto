import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { describe, expect, it , vi } from "vitest";

import {
  countLogEntries,
  formatAdviceInput,
  getLogStats,
  formatHelp,
  formatMonthlyTrendSummary,
  formatStats,
  getJstDateString,
  getJstWeekString,
  renderAppendEntry,
  renderLog,
  renderMonthlySummary,
  renderWeeklySummary,
  runCli,
  writeLogFile,
  writeMonthlySummary,
  writeWeeklySummary,
} from "../src/index.js";

describe("formatAdviceInput", () => {
  it("joins multiple log contents with blank lines", () => {
    const result = formatAdviceInput([
      "first log",
      "second log",
      "third log",
    ]);

    expect(result).toBe(
      [
        "# Recent logs for reflection",
        "",
        "first log",
        "",
        "second log",
        "",
        "third log",
        "",
        "# Reflection questions",
        "",
        "- What has changed across these logs?",
        "- Which emotions or patterns repeat?",
        "- What is one small action you can take next?",
      ].join("\n"),
    );
  });
});

describe("getJstDateString", () => {
  it("formats a date in JST as YYYY-MM-DD", () => {
    const utc = new Date("2026-03-25T18:30:00.000Z");

    expect(getJstDateString(utc)).toBe("2026-03-26");
  });
});

describe("getJstWeekString", () => {
  it("formats a date as an ISO week in JST", () => {
    expect(getJstWeekString(new Date("2026-03-25T18:30:00.000Z"))).toBe("2026-W13");
  });

  it("handles ISO weeks at a year boundary", () => {
    expect(getJstWeekString(new Date("2021-01-01T00:00:00.000Z"))).toBe("2020-W53");
    expect(getJstWeekString(new Date("2021-01-04T00:00:00.000Z"))).toBe("2021-W01");
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

describe("renderAppendEntry", () => {
  it("renders an appended entry with an injected timestamp", () => {
    expect(
      renderAppendEntry(
        "2026-03-26",
        renderLog("夜のメモ", "2026-03-26"),
        "2026-03-26 21:15:30 JST",
      ),
    ).toBe("## Entry 2026-03-26 21:15:30 JST\n\n夜のメモ\n");
  });
});

describe("countLogEntries", () => {
  it("counts the initial log and appended entries", () => {
    const content =
      "# 2026-03-26\n\n最初のメモ\n\n" +
      "## Entry 2026-03-26 12:00:00 JST\n\n2回目\n\n" +
      "## Entry 2026-03-26 18:00:00 JST\n\n3回目\n";

    expect(countLogEntries(content)).toBe(3);
  });
});

describe("getLogStats", () => {
  it("counts markdown log files", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    await mkdir(join(baseDir, "logs"));
    await writeFile(
  join(baseDir, "logs", "2026-03-26.md"),
  "# 2026-03-26\n\n最初の記録\n\n## Entry 12:00\n\n2回目\n\n## Entry 20:00\n\n3回目\n",
);
    await writeFile(
  join(baseDir, "logs", "2026-03-20.md"),
  "# 2026-03-20\n\n古い記録\n",
);
    const result = await getLogStats(baseDir);
 expect(result).toEqual({
  totalFiles: 2,
  totalEntries: 4,
  averageEntriesPerLogDay: 2,
  maxEntriesPerDay: 3,
  mostActiveDay: "2026-03-26",
  latestLog: "2026-03-26",
  oldestLog: "2026-03-20",
  daysSinceLastLog: 149,
  currentStreak: 1,
  longestStreak: 1,
  logDaysThisMonth: 0,
  logDaysLastMonth: 0,
  logDaysChange: 0,
  logRateThisMonth: 0,
  logRateLastMonth: 0,
  logRateChange: 0,
  logRateChangeText: "0.0",
  monthlyTrend: "steady",
  logDaysChangeText: "0",
});
vi.useRealTimers();
});
it("formats positive monthly log day change with plus sign", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));
  
 const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-positive-change-"));
 const logsDir = join(baseDir, "logs");
 await mkdir(logsDir);
 await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
 await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
 await writeFile(join(logsDir, "2026-08-02.md"), "# 2026-08-02\n");
 const result = await getLogStats(baseDir);

 expect(result.logDaysChangeText).toBe("+1");
 vi.useRealTimers();

});
it("reports improving monthly trend", async () => {
  
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));


const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-improving-trend-"));
const logsDir = join(baseDir, "logs");

await mkdir(logsDir);
await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
await writeFile(join(logsDir, "2026-08-02.md"), "# 2026-08-02\n");

const result = await getLogStats(baseDir);

expect(result.monthlyTrend).toBe("improving");

vi.useRealTimers();
});
it("reports declining monthly trend", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));

const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-declining-trend-"));
const logsDir = join(baseDir, "logs");

await mkdir(logsDir);
await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
await writeFile(join(logsDir, "2026-07-02.md"), "# 2026-07-02\n");
await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
const result = await getLogStats(baseDir);

expect(result.monthlyTrend).toBe("declining");

vi.useRealTimers();
});

it("reports steady monthly trend", async () => {
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));

const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-steady-trend-"));
const logsDir = join(baseDir, "logs");

await mkdir(logsDir);

const result = await getLogStats(baseDir);
expect(result.monthlyTrend).toBe("steady");
vi.useRealTimers();
});


it("formats negative monthly log day change", async () => {
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));
const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-negative-change-"));
const logsDir = join(baseDir, "logs");

await mkdir(logsDir);
await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
await writeFile(join(logsDir, "2026-07-02.md"), "# 2026-07-02\n");
await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
const result = await getLogStats(baseDir);

expect(result.logDaysChangeText).toBe("-1");

vi.useRealTimers();
});
it("calculates the monthly log rate", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-24T00:00:00+09:00"));

  const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-log-rate-"));
  const logsDir = join(baseDir, "logs");

  await mkdir(logsDir);

  await writeFile(
    join(logsDir, "2026-08-01.md"),
    "# 2026-08-01\n",
  );

  const result = await getLogStats(baseDir);
  expect(result.logRateThisMonth).toBeCloseTo(4.1667, 3);
  vi.useRealTimers();

});

it("counts consecutive log days from the latest log", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-streak-"));
  const logsDir = join(baseDir, "logs");

  await mkdir(logsDir);

  await writeFile(join(logsDir, "2026-03-24.md"), "# 2026-03-24\n");
  await writeFile(join(logsDir, "2026-03-25.md"), "# 2026-03-25\n");
  await writeFile(join(logsDir, "2026-03-26.md"), "# 2026-03-26\n");

  const result = await getLogStats(baseDir);

  expect(result.currentStreak).toBe(3);
});
it("tracks the longest streak", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-longest-streak-"));
  const logsDir = join(baseDir, "logs");
  await mkdir(logsDir);
  await writeFile(join(logsDir, "2026-03-20.md"), "# 2026-03-20\n");
  await writeFile(join(logsDir, "2026-03-21.md"), "# 2026-03-21\n");
  await writeFile(join(logsDir, "2026-03-22.md"), "# 2026-03-22\n");
  await writeFile(join(logsDir, "2026-03-25.md"), "# 2026-03-25\n");
  const result = await getLogStats(baseDir);
  expect(result.longestStreak).toBe(3);
  expect(result.currentStreak).toBe(1);
});

});
describe("renderMonthlySummary", () => {
  
  it("renders logs in the supplied order", () => {
    expect(
      renderMonthlySummary("2026-07", [
        { date: "2026-07-01", content: "# 2026-07-01\n\nFirst\n" },
        { date: "2026-07-03", content: "# 2026-07-03\n\nThird\n" },
      ]),
    ).toBe(
      "# Monthly Summary: 2026-07\n\n## 2026-07-01\n\n# 2026-07-01\n\nFirst\n\n## 2026-07-03\n\n# 2026-07-03\n\nThird\n",
    );
  });

  it("renders the required empty-month message", () => {
    expect(renderMonthlySummary("2026-08", [])).toBe(
      "# Monthly Summary: 2026-08\n\n対象月のログはありません。\n",

 
    );
    
  });
});

describe("renderWeeklySummary", () => {
  it("renders logs in ascending date order supplied by the caller", () => {
    expect(
      renderWeeklySummary("2026-W13", [
        { date: "2026-03-23", content: "# 2026-03-23\n\nMonday\n" },
        { date: "2026-03-25", content: "# 2026-03-25\n\nWednesday\n" },
      ]),
    ).toBe(
      "# Weekly Summary: 2026-W13\n\n## 2026-03-23\n\n# 2026-03-23\n\nMonday\n\n## 2026-03-25\n\n# 2026-03-25\n\nWednesday\n",
    );
  });

  it("renders the required empty-week message", () => {
    expect(renderWeeklySummary("2026-W14", [])).toBe(
      "# Weekly Summary: 2026-W14\n\n対象週のログはありません。\n",
    );
  });
});

describe("formatMonthlyTrendSummary", () => {
  it("formats improving trend", () => {
    expect(formatMonthlyTrendSummary("improving")).toBe(
      "Logging is improving this month.",
    );
  });

  it("formats declining trend", () => {
    expect(formatMonthlyTrendSummary("declining")).toBe(
      "Logging is declining this month.",
    );
  });

  it("formats steady trend", () => {
    expect(formatMonthlyTrendSummary("steady")).toBe(
      "Logging is steady this month.",
    );
  });
});

describe("formatStats", () => {
  it("renders all stats fields", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-format-stats-"));
    const logsDir = join(baseDir, "logs");

    await mkdir(logsDir);

    await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
    await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
    await writeFile(join(logsDir, "2026-08-02.md"), "# 2026-08-02\n");
    const stats = await getLogStats(baseDir);
    const output = formatStats(stats);
    expect(output).toContain("Log files:");
    expect(output).toContain("Log entries:");
    expect(output).toContain("Average entries per log day:");
    expect(output).toContain("Most entries in a day:");
    expect(output).toContain("Most active day:");
    expect(output).toContain("Latest log:");
    expect(output).toContain("Oldest log:");
    expect(output).toContain("Days since last log:");
    expect(output).toContain("Current streak:");
    expect(output).toContain("Longest streak:");
    expect(output).toContain("Log days this month:");
    expect(output).toContain("Log rate this month:");
    expect(output).toContain("Log days last month:");
    expect(output).toContain("Log rate last month:");
    expect(output).toContain("Log rate change:");
    expect(output).toContain("Monthly trend:");
    expect(output).toContain("Summary:");
    expect(output).toContain("Log days change:");

    vi.useRealTimers();
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
    expect(formatHelp()).toContain("--stats");
    expect(formatHelp()).toContain("--advice");
    expect(formatHelp()).toContain("--weekly-summary [YYYY-Www]");
    expect(formatHelp()).toContain("Examples:");
    expect(formatHelp()).toContain("Re-running on the same date appends a timestamped entry");
    expect(formatHelp()).toContain("mirror-logs/: not implemented");
    expect(formatHelp()).toContain("--mirror-advice");
    expect(formatHelp()).not.toContain("Unknown option: --stats");
  });
});

describe("runCli help", () => {
  it("returns help mode when --help is passed", async () => {
    await expect(runCli(["--help"])).resolves.toEqual({
      filePath: null,
      help: true,
      stats: null,
      adviceContent: null,
      safeShareText: null,
      mobileImportPlans: null,
      dryRun: false,
    });
  });
});

describe("writeLogFile", () => {
  it("creates the logs directory and writes the file", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    await mkdir(join(baseDir, "logs"));
    const content = renderLog("テスト", "2026-03-26");
    const filePath = await writeLogFile("2026-03-26", content, baseDir);

    await expect(readFile(filePath, "utf8")).resolves.toBe(content);
  });

  it("appends a timestamped entry without overwriting existing content", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-append-"));
    const logsDir = join(baseDir, "logs");
    const filePath = join(logsDir, "2026-03-26.md");
    const existingContent = "# 2026-03-26\n\n朝のメモ\n";

    await mkdir(logsDir, { recursive: true });
    await writeFile(filePath, existingContent, "utf8");
    await writeLogFile("2026-03-26", renderLog("夜のメモ", "2026-03-26"), baseDir);

    const nextContent = await readFile(filePath, "utf8");

    expect(nextContent.startsWith(existingContent)).toBe(true);
    expect(nextContent).toContain("\n\n## Entry ");
    expect(nextContent).toContain("JST\n\n夜のメモ\n");
    expect(nextContent).toMatch(
      /^# 2026-03-26\n\n朝のメモ\n\n## Entry \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} JST\n\n夜のメモ\n$/u,
    );
  });

  it("treats whitespace-only files as empty logs", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-empty-log-"));
    const logsDir = join(baseDir, "logs");
    const filePath = join(logsDir, "2026-03-26.md");
    const content = renderLog("最初のメモ", "2026-03-26");

    await mkdir(logsDir, { recursive: true });
    await writeFile(filePath, " \n\n\t", "utf8");
    await writeLogFile("2026-03-26", content, baseDir);

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
      stats: null,
      adviceContent: null,
      safeShareText: null,
      mobileImportPlans: null,
      dryRun: false,
    });

    if (result.filePath === null) {
      throw new Error("Expected a file path");
    }

    await expect(readFile(result.filePath, "utf8")).resolves.toContain("今日は");
  });

  it("returns the three most recent log contents for --advice", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-advice-"));
    const logsDir = join(baseDir, "logs");

    await mkdir(logsDir);

    await writeFile(
      join(logsDir, "2026-09-01.md"),
      "# 2026-09-01\n\nold log\n",
    );

    await writeFile(
      join(logsDir, "2026-09-03.md"),
      "# 2026-09-03\n\nlatest log\n",
    );

    await writeFile(
      join(logsDir, "2026-09-05.md"),
      "# 2026-09-05\n\nthird log\n",
    );

    await writeFile(
      join(logsDir, "2026-09-07.md"),
      "# 2026-09-07\n\nlatest log\n",
    );

    const result = await runCli([
      "--advice",
      "--output-dir",
      baseDir,
    ]);

    expect(result.adviceContent).toBe(
      formatAdviceInput([
        "# 2026-09-03\n\nlatest log\n",
        "# 2026-09-05\n\nthird log\n",
        "# 2026-09-07\n\nlatest log\n",
      ]),
    );
  });

  it("rejects --advice when no logs exist", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-advice-empty-"));
    const logsDir = join(baseDir, "logs");

    await mkdir(logsDir);

    await expect(
      runCli(["--advice", "--output-dir", baseDir]),
    ).rejects.toThrow("No logs found for advice");
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

  it("appends new entries to an existing --date log", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-cli-append-"));
    const args = ["--date", "2026-03-26", "--output-dir", baseDir];

    await runCli([...args, "朝のメモ"]);
    const result = await runCli([...args, "夜のメモ"]);

    expect(result.filePath).toBe(join(baseDir, "logs", "2026-03-26.md"));

    if (result.filePath === null) {
      throw new Error("Expected a file path");
    }

    const nextContent = await readFile(result.filePath, "utf8");

    expect(nextContent).toContain("# 2026-03-26\n\n朝のメモ\n");
    expect(nextContent).toContain("JST\n\n夜のメモ\n");
    expect(nextContent).not.toBe("# 2026-03-26\n\n夜のメモ\n");
  });

  it("rejects an invalid date", async () => {
    await expect(runCli(["--date", "2026-13-01"])).rejects.toThrow(
      "Invalid value for --date: 2026-13-01",
    );
  });

  it("creates a monthly summary in ascending date order", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-monthly-summary-"));
    const logsDir = join(baseDir, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(join(logsDir, "2026-07-03.md"), "# 2026-07-03\n\nThird\n", "utf8");
    await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n\nFirst\n", "utf8");
    await writeFile(join(logsDir, "2026-07-02.md"), "# 2026-07-02\n\nSecond\n", "utf8");
    await writeFile(join(logsDir, "2026-08-01.md"), "outside month\n", "utf8");

    const result = await runCli(["--monthly-summary", "2026-07", "--output-dir", baseDir]);
    const summaryPath = join(baseDir, "monthly-summary", "2026-07.md");

    expect(result.filePath).toBe(summaryPath);
    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Monthly Summary: 2026-07\n\n## 2026-07-01\n\n# 2026-07-01\n\nFirst\n\n## 2026-07-02\n\n# 2026-07-02\n\nSecond\n\n## 2026-07-03\n\n# 2026-07-03\n\nThird\n",
    );
    await expect(readFile(join(logsDir, "2026-07-01.md"), "utf8")).resolves.toBe(
      "# 2026-07-01\n\nFirst\n",
    );
  });

  it("overwrites an existing summary and creates an empty-month summary", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-monthly-empty-"));
    const summaryPath = await writeMonthlySummary("2026-09", baseDir);
    await writeFile(summaryPath, "old summary\n", "utf8");

    await runCli(["--monthly-summary", "2026-09", "--output-dir", baseDir]);

    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Monthly Summary: 2026-09\n\n対象月のログはありません。\n",
    );
  });

  it("uses the current JST month when no month is supplied", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-monthly-current-"));
    const currentMonth = getJstDateString().slice(0, 7);

    const result = await runCli(["--monthly-summary", "--output-dir", baseDir]);

    expect(result.filePath).toBe(join(baseDir, "monthly-summary", `${currentMonth}.md`));
  });

  it("creates and overwrites a weekly summary from daily logs", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-weekly-summary-"));
    const logsDir = join(baseDir, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(join(logsDir, "2026-03-25.md"), "# 2026-03-25\n\nWednesday\n", "utf8");
    await writeFile(join(logsDir, "2026-03-23.md"), "# 2026-03-23\n\nMonday\n", "utf8");

    const summaryPath = await writeWeeklySummary("2026-W13", baseDir);
    expect(summaryPath).toBe(join(baseDir, "weekly-summary", "2026-W13.md"));
    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Weekly Summary: 2026-W13\n\n## 2026-03-23\n\n# 2026-03-23\n\nMonday\n\n## 2026-03-25\n\n# 2026-03-25\n\nWednesday\n",
    );

    await writeFile(summaryPath, "old summary\n", "utf8");
    await writeWeeklySummary("2026-W13", baseDir);
    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Weekly Summary: 2026-W13\n\n## 2026-03-23\n\n# 2026-03-23\n\nMonday\n\n## 2026-03-25\n\n# 2026-03-25\n\nWednesday\n",
    );
  });

  it("supports the current JST week and an explicit week through the CLI", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-weekly-cli-"));
    const explicit = await runCli(["--weekly-summary", "2026-W13", "--output-dir", baseDir]);
    expect(explicit.filePath).toBe(join(baseDir, "weekly-summary", "2026-W13.md"));

    const current = await runCli(["--weekly-summary", "--output-dir", baseDir]);
    expect(current.filePath).toBe(join(baseDir, "weekly-summary", `${getJstWeekString()}.md`));
  });

  it("rejects malformed and nonexistent ISO weeks", async () => {
    await expect(runCli(["--weekly-summary", "2026-13"])).rejects.toThrow(
      "Invalid value for --weekly-summary: 2026-13",
    );
    await expect(runCli(["--weekly-summary", "2021-W53"])).rejects.toThrow(
      "Invalid value for --weekly-summary: 2021-W53",
    );
  });

  it("includes logs when the week crosses a month boundary", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-weekly-boundary-"));
    const logsDir = join(baseDir, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(join(logsDir, "2026-03-30.md"), "# 2026-03-30\n\nMarch\n", "utf8");
    await writeFile(join(logsDir, "2026-04-01.md"), "# 2026-04-01\n\nApril\n", "utf8");

    const summaryPath = await writeWeeklySummary("2026-W14", baseDir);

    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Weekly Summary: 2026-W14\n\n## 2026-03-30\n\n# 2026-03-30\n\nMarch\n\n## 2026-04-01\n\n# 2026-04-01\n\nApril\n",
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
      stats: null,
      adviceContent: null,
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
      stats: null,
      adviceContent: null,
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
