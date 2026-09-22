import { appendFile, mkdir, readFile, readdir, rename, stat, writeFile, } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSafeShareInput, sanitizeForSafeShare } from "./safe-share.js";
const JST_TIME_ZONE = "Asia/Tokyo";
const DEFAULT_LOG_DIR = "logs";
const HELP_TEXT = `mental-auto

JST-based daily memo CLI. Current implementation writes one Markdown log per day.

Usage:
  mental-auto [options] [memo...]
  mental-auto --safe-share INPUT
  mental-auto --monthly-summary [YYYY-MM]
  mental-auto --weekly-summary [YYYY-Www]
  mental-auto --import-mobile FILE_OR_DIR [--dry-run]
  mental-auto --advice

Options:
  --date YYYY-MM-DD   Specify the log date in JST
  --memo TEXT         Pass the memo body as a single argument
  --output-dir PATH   Write logs under PATH/logs
  --import-mobile X   Import mobile inbox Markdown file(s)
  --dry-run           Show import-mobile actions without changing files
  --safe-share INPUT  Print AI-share-safe text to stdout
  --stats             Show log statistics and monthly trend
  --advice            Show the three most recent log contents
  --monthly-summary [YYYY-MM]
                      Combine the month's daily logs into monthly-summary/YYYY-MM.md
  --weekly-summary [YYYY-Www]
                      Combine the week's daily logs into weekly-summary/YYYY-Www.md
  --help, -h          Show this help


Examples:
  mental-auto "今日は少し疲れた"
  mental-auto --date 2026-03-26 "今日は少し疲れた"
  mental-auto --memo "今日は気分が重い"
  mental-auto --output-dir ./tmp "退避メモ"
  mental-auto --import-mobile mobile-inbox/2026-06-25.md
  mental-auto --import-mobile mobile-inbox --dry-run
  mental-auto --safe-share "contact me at foo@example.com"
  mental-auto --safe-share logs/2026-03-26.md
  mental-auto --stats
  mental-auto --monthly-summary
  mental-auto --monthly-summary 2026-07
  mental-auto --weekly-summary
  mental-auto --weekly-summary 2026-W13
  mental-auto --help
  mental-auto --advice

Behavior:
  - Default output: ./logs/YYYY-MM-DD.md
  - --output-dir PATH writes to PATH/logs/YYYY-MM-DD.md
  - The date is determined in JST unless --date is specified
  - Re-running on the same date appends a timestamped entry
  - --import-mobile reads YYYY-MM-DD.md and appends it under "## Mobile notes"
  - Imported files are moved to mobile-inbox/archive/
  - --dry-run only reports planned import-mobile actions
  - --safe-share reads text or a local file and prints sanitized text to stdout
  - --stats shows log statistics, monthly trend, and a trend summary
  - --monthly-summary reads logs in ascending date order and overwrites the monthly summary
  - --weekly-summary reads logs in ascending date order and overwrites the weekly summary
  - Empty memo writes "_No memo provided_"
  - --advice reads and prints the three most recent logs

logs / mirror-logs:
  - logs/: implemented primary output directory
  - mirror-logs/: not implemented; no files are generated

Unimplemented options:
  - --mirror-stats
  - --mirror-advice
  These currently fail with an unknown option error.
`;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;
const MOBILE_IMPORT_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;
const MOBILE_NOTES_HEADING = "## Mobile notes";
export function getJstDateString(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en", {
        timeZone: JST_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    return `${year}-${month}-${day}`;
}
function getJstTimeString(now = new Date()) {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: JST_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(now);
}
export function renderLog(memo = "", date, timestamp) {
    const body = memo.trim();
    const lines = [`# ${date}`, ""];
    if (timestamp) {
        lines.push(`## ${timestamp}`, "");
    }
    lines.push(body === "" ? "_No memo provided_" : body, "");
    return lines.join("\n");
}
function getJstTimestampString(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en", {
        timeZone: JST_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(now);
    const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")} JST`;
}
export function renderAppendEntry(date, content, timestamp) {
    const normalizedContent = content.replace(/\r\n/g, "\n").trim();
    const heading = `# ${date}`;
    const body = normalizedContent.startsWith(heading)
        ? normalizedContent.slice(heading.length).trim()
        : normalizedContent;
    return [`## Entry ${timestamp}`, "", body === "" ? "_No memo provided_" : body, ""].join("\n");
}
export function countLogEntries(content) {
    const appendEntries = content.match(/^## Entry /gm)?.length ?? 0;
    return 1 + appendEntries;
}
function getPreviousDate(date) {
    const currentDate = new Date(date);
    currentDate.setDate(currentDate.getDate() - 1);
    return currentDate.toISOString().split("T")[0];
}
export async function getLogStats(baseDir = process.cwd()) {
    const logsDir = join(baseDir, DEFAULT_LOG_DIR);
    const entries = await readdir(logsDir, { withFileTypes: true });
    const logFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
    const totalFiles = logFiles.length;
    const sortedFileNames = logFiles
        .map((entry) => entry.name)
        .sort();
    const latestFileName = sortedFileNames.at(-1);
    const oldestFileName = sortedFileNames.at(0);
    const latestLog = latestFileName?.replace(/\.md$/, "") ?? null;
    const oldestLog = oldestFileName?.replace(/\.md$/, "") ?? null;
    const today = getJstDateString();
    const currentMonth = today.slice(0, 7);
    const daysElapsedThisMonth = Number(today.slice(8, 10));
    const previousMonthDate = new Date(`${today}T00:00:00Z`);
    previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);
    const previousMonth = previousMonthDate.toISOString().slice(0, 7);
    const daysInLastMonth = new Date(Date.UTC(previousMonthDate.getUTCFullYear(), previousMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
    const logDaysThisMonth = sortedFileNames.filter((fileName) => fileName.startsWith(currentMonth)).length;
    let currentStreak = 0;
    let longestStreak = 0;
    const logDaysLastMonth = sortedFileNames.filter((fileName) => fileName.startsWith(previousMonth)).length;
    const logRateLastMonth = daysInLastMonth === 0
        ? 0
        : (logDaysLastMonth / daysInLastMonth) * 100;
    const logDaysChange = logDaysThisMonth - logDaysLastMonth;
    const logRateThisMonth = daysElapsedThisMonth === 0
        ? 0
        : (logDaysThisMonth / daysElapsedThisMonth) * 100;
    const logRateChange = logRateThisMonth - logRateLastMonth;
    const logRateChangeText = logRateChange > 0
        ? `+${logRateChange.toFixed(1)}`
        : logRateChange.toFixed(1);
    const monthlyTrend = logRateChange > 0
        ? "improving"
        : logRateChange < 0
            ? "declining"
            : "steady";
    const logDaysChangeText = logDaysChange > 0 ? `+${logDaysChange}` : `${logDaysChange}`;
    let daysSinceLastLog = 0;
    let previousDate = null;
    for (const fileName of sortedFileNames) {
        const date = fileName.replace(/\.md$/, "");
        if (previousDate === getPreviousDate(date)) {
            currentStreak += 1;
        }
        else {
            currentStreak = 1;
        }
        if (currentStreak > longestStreak) {
            longestStreak = currentStreak;
        }
        previousDate = date;
    }
    if (latestLog !== null) {
        const todayDate = new Date(today);
        const latestDate = new Date(latestLog);
        const differenceMs = todayDate.getTime() - latestDate.getTime();
        daysSinceLastLog = differenceMs / 86400000;
        currentStreak = 1;
        let checkDate = getPreviousDate(latestLog);
        while (sortedFileNames.includes(`${checkDate}.md`)) {
            currentStreak += 1;
            checkDate = getPreviousDate(checkDate);
        }
    }
    let totalEntries = 0;
    let maxEntriesPerDay = 0;
    let mostActiveDay = null;
    for (const logFile of logFiles) {
        const filePath = join(logsDir, logFile.name);
        const content = await readFile(filePath, "utf8");
        const entryCount = countLogEntries(content);
        totalEntries += entryCount;
        if (entryCount > maxEntriesPerDay) {
            maxEntriesPerDay = entryCount;
            mostActiveDay = logFile.name.replace(/\.md$/, "");
        }
    }
    const averageEntriesPerLogDay = totalFiles === 0 ? 0 : totalEntries / totalFiles;
    return {
        totalFiles,
        totalEntries,
        averageEntriesPerLogDay,
        maxEntriesPerDay,
        mostActiveDay,
        latestLog,
        oldestLog,
        daysSinceLastLog,
        currentStreak,
        longestStreak,
        logDaysThisMonth,
        logDaysLastMonth,
        logDaysChange,
        logRateThisMonth,
        logRateLastMonth,
        logRateChange,
        logRateChangeText,
        monthlyTrend,
        logDaysChangeText,
    };
}
export async function writeLogFile(date, content, baseDir = process.cwd()) {
    const logsDir = join(baseDir, DEFAULT_LOG_DIR);
    const filePath = join(logsDir, `${date}.md`);
    await mkdir(logsDir, { recursive: true });
    try {
        const existingContent = await readFile(filePath, "utf8");
        if (existingContent.trim() !== "") {
            const separator = existingContent.endsWith("\n") ? "\n" : "\n\n";
            await appendFile(filePath, `${separator}${renderAppendEntry(date, content, getJstTimestampString())}`, "utf8");
            return filePath;
        }
    }
    catch (error) {
        const nodeError = error;
        if (nodeError.code !== "ENOENT") {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read existing log: ${filePath}: ${message}`);
        }
    }
    await writeFile(filePath, content, "utf8");
    return filePath;
}
function getJstMonthString(now = new Date()) {
    return getJstDateString(now).slice(0, 7);
}
function validateMonth(month) {
    const match = MONTH_PATTERN.exec(month);
    if (match === null) {
        throw new Error(`Invalid value for --monthly-summary: ${month}`);
    }
    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    if (monthNumber < 1 || monthNumber > 12 || !Number.isInteger(year)) {
        throw new Error(`Invalid value for --monthly-summary: ${month}`);
    }
}
function getIsoWeekString(date) {
    const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayOfWeek = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() + 4 - dayOfWeek);
    const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((value.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
export function getJstWeekString(now = new Date()) {
    const jstDate = getJstDateString(now);
    const [year, month, day] = jstDate.split("-").map(Number);
    return getIsoWeekString(new Date(Date.UTC(year, month - 1, day)));
}
function getWeekStartDate(week) {
    const match = WEEK_PATTERN.exec(week);
    if (match === null) {
        throw new Error(`Invalid value for --weekly-summary: ${week}`);
    }
    const year = Number(match[1]);
    const weekNumber = Number(match[2]);
    const januaryFourth = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = januaryFourth.getUTCDay() || 7;
    const monday = new Date(januaryFourth);
    monday.setUTCDate(januaryFourth.getUTCDate() - dayOfWeek + 1 + (weekNumber - 1) * 7);
    if (weekNumber < 1 || weekNumber > 53 || getIsoWeekString(monday) !== week) {
        throw new Error(`Invalid value for --weekly-summary: ${week}`);
    }
    return monday;
}
export function renderWeeklySummary(week, logs) {
    const sections = logs.map(({ date, content }) => {
        const normalizedContent = normalizeLineEndings(content).trim();
        return `## ${date}\n\n${normalizedContent}`;
    });
    if (sections.length === 0) {
        return `# Weekly Summary: ${week}\n\n対象週のログはありません。\n`;
    }
    return [`# Weekly Summary: ${week}`, ...sections].join("\n\n") + "\n";
}
export async function writeWeeklySummary(week, baseDir = process.cwd()) {
    const weekStart = getWeekStartDate(week);
    const logs = [];
    for (let offset = 0; offset < 7; offset += 1) {
        const dateValue = new Date(weekStart);
        dateValue.setUTCDate(weekStart.getUTCDate() + offset);
        const date = dateValue.toISOString().slice(0, 10);
        const filePath = join(baseDir, DEFAULT_LOG_DIR, `${date}.md`);
        try {
            logs.push({ date, content: await readFile(filePath, "utf8") });
        }
        catch (error) {
            const nodeError = error;
            if (nodeError.code !== "ENOENT") {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to read log: ${filePath}: ${message}`);
            }
        }
    }
    const summaryPath = join(baseDir, "weekly-summary", `${week}.md`);
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderWeeklySummary(week, logs), "utf8");
    return summaryPath;
}
export function renderMonthlySummary(month, logs) {
    const sections = logs.map(({ date, content }) => {
        const normalizedContent = normalizeLineEndings(content).trim();
        return `## ${date}\n\n${normalizedContent}`;
    });
    if (sections.length === 0) {
        return `# Monthly Summary: ${month}\n\n対象月のログはありません。\n`;
    }
    return [`# Monthly Summary: ${month}`, ...sections].join("\n\n") + "\n";
}
export async function writeMonthlySummary(month, baseDir = process.cwd()) {
    validateMonth(month);
    const [year, monthNumber] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const logs = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = `${month}-${String(day).padStart(2, "0")}`;
        const filePath = join(baseDir, DEFAULT_LOG_DIR, `${date}.md`);
        try {
            logs.push({ date, content: await readFile(filePath, "utf8") });
        }
        catch (error) {
            const nodeError = error;
            if (nodeError.code !== "ENOENT") {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to read log: ${filePath}: ${message}`);
            }
        }
    }
    const summaryPath = join(baseDir, "monthly-summary", `${month}.md`);
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, renderMonthlySummary(month, logs), "utf8");
    return summaryPath;
}
function validateDate(date) {
    if (!DATE_PATTERN.test(date)) {
        throw new Error(`Invalid value for --date: ${date}`);
    }
    const utc = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(utc.getTime()) || getJstDateString(utc) !== date) {
        throw new Error(`Invalid value for --date: ${date}`);
    }
}
function parseArgs(args) {
    const memoParts = [];
    let date = getJstDateString(new Date());
    let outputDir = resolve(process.cwd());
    let help = false;
    let stats = false;
    let advice = false;
    let memoSpecified = false;
    let safeShareInput = null;
    let importMobilePath = null;
    let dryRun = false;
    let monthlySummaryMonth = null;
    let weeklySummaryWeek = null;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") {
            help = true;
            continue;
        }
        if (arg === "--stats") {
            stats = true;
            continue;
        }
        if (arg === "--advice") {
            advice = true;
            continue;
        }
        if (arg === "--date") {
            const value = args[index + 1];
            if (value === undefined) {
                throw new Error("Missing value for --date");
            }
            validateDate(value);
            date = value;
            index += 1;
            continue;
        }
        if (arg === "--memo") {
            const value = args[index + 1];
            if (value === undefined) {
                throw new Error("Missing value for --memo");
            }
            memoParts.length = 0;
            memoParts.push(value);
            memoSpecified = true;
            index += 1;
            continue;
        }
        if (arg === "--output-dir") {
            const value = args[index + 1];
            if (value === undefined) {
                throw new Error("Missing value for --output-dir");
            }
            outputDir = resolve(value);
            index += 1;
            continue;
        }
        if (arg === "--safe-share") {
            const value = args[index + 1];
            if (value === undefined) {
                throw new Error("Missing value for --safe-share");
            }
            safeShareInput = value;
            index += 1;
            continue;
        }
        if (arg === "--monthly-summary") {
            const value = args[index + 1];
            if (value !== undefined && !value.startsWith("--")) {
                validateMonth(value);
                monthlySummaryMonth = value;
                index += 1;
            }
            else {
                monthlySummaryMonth = getJstMonthString(new Date());
            }
            continue;
        }
        if (arg === "--weekly-summary") {
            const value = args[index + 1];
            if (value !== undefined && !value.startsWith("--")) {
                getWeekStartDate(value);
                weeklySummaryWeek = value;
                index += 1;
            }
            else {
                weeklySummaryWeek = getJstWeekString(new Date());
            }
            continue;
        }
        if (arg === "--import-mobile") {
            const value = args[index + 1];
            if (value === undefined) {
                throw new Error("Missing value for --import-mobile");
            }
            importMobilePath = resolve(value);
            index += 1;
            continue;
        }
        if (arg === "--dry-run") {
            dryRun = true;
            continue;
        }
        if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        }
        if (!memoSpecified) {
            memoParts.push(arg);
        }
    }
    if (dryRun && importMobilePath === null) {
        throw new Error("--dry-run requires --import-mobile");
    }
    return {
        memo: memoParts.join(" "),
        date,
        outputDir,
        help,
        stats,
        advice,
        safeShareInput,
        importMobilePath,
        dryRun,
        monthlySummaryMonth,
        weeklySummaryWeek,
    };
}
function getMobileImportDateFromFilename(filePath) {
    const fileName = basename(filePath);
    const match = MOBILE_IMPORT_PATTERN.exec(fileName);
    if (match === null) {
        throw new Error(`Invalid mobile inbox filename (expected YYYY-MM-DD.md): ${fileName}`);
    }
    validateDate(match[1]);
    return match[1];
}
async function collectMobileImportPlans(importPath, outputDir) {
    let targetStat;
    try {
        targetStat = await stat(importPath);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to access mobile inbox path: ${importPath}: ${message}`);
    }
    if (targetStat.isDirectory()) {
        const entries = await readdir(importPath, { withFileTypes: true });
        const plans = [];
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            if (!entry.isFile() || !entry.name.endsWith(".md")) {
                continue;
            }
            const sourcePath = join(importPath, entry.name);
            const date = getMobileImportDateFromFilename(sourcePath);
            plans.push({
                sourcePath,
                targetLogPath: join(outputDir, DEFAULT_LOG_DIR, `${date}.md`),
                archivePath: join(importPath, "archive", entry.name),
                date,
            });
        }
        return plans;
    }
    if (!targetStat.isFile()) {
        throw new Error(`Mobile inbox path is neither a file nor a directory: ${importPath}`);
    }
    const date = getMobileImportDateFromFilename(importPath);
    const parentDir = dirname(importPath);
    return [
        {
            sourcePath: importPath,
            targetLogPath: join(outputDir, DEFAULT_LOG_DIR, `${date}.md`),
            archivePath: join(parentDir, "archive", basename(importPath)),
            date,
        },
    ];
}
function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, "\n");
}
function buildLogWithMobileNotes(existingLog, date, mobileMarkdown) {
    const mobileBody = normalizeLineEndings(mobileMarkdown).trim();
    const initialLog = existingLog === null || existingLog.trim() === ""
        ? `# ${date}\n`
        : normalizeLineEndings(existingLog);
    const normalizedLog = initialLog.endsWith("\n") ? initialLog : `${initialLog}\n`;
    const existingSectionPattern = /^## Mobile notes\s*$/m;
    const existingSectionMatch = existingSectionPattern.exec(normalizedLog);
    if (existingSectionMatch === null) {
        const trimmedLog = normalizedLog.replace(/\s+$/u, "");
        return `${trimmedLog}\n\n${MOBILE_NOTES_HEADING}\n\n${mobileBody}\n`;
    }
    const nextSectionPattern = /^##\s+/gm;
    nextSectionPattern.lastIndex = existingSectionMatch.index + MOBILE_NOTES_HEADING.length;
    const nextSectionMatch = nextSectionPattern.exec(normalizedLog);
    const sectionEnd = nextSectionMatch?.index ?? normalizedLog.length;
    const beforeSectionEnd = normalizedLog.slice(0, sectionEnd).replace(/\s+$/u, "");
    const afterSection = normalizedLog.slice(sectionEnd).replace(/^\n+/u, "");
    if (afterSection === "") {
        return `${beforeSectionEnd}\n\n${mobileBody}\n`;
    }
    return `${beforeSectionEnd}\n\n${mobileBody}\n\n${afterSection}`;
}
async function importSingleMobileFile(plan, dryRun) {
    if (dryRun) {
        return;
    }
    let mobileMarkdown;
    try {
        mobileMarkdown = await readFile(plan.sourcePath, "utf8");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read Markdown: ${plan.sourcePath}: ${message}`);
    }
    let existingLog = null;
    try {
        existingLog = await readFile(plan.targetLogPath, "utf8");
    }
    catch (error) {
        const nodeError = error;
        if (nodeError.code !== "ENOENT") {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to read existing log: ${plan.targetLogPath}: ${message}`);
        }
    }
    const nextLogContent = buildLogWithMobileNotes(existingLog, plan.date, mobileMarkdown);
    try {
        await mkdir(dirname(plan.targetLogPath), { recursive: true });
        await writeFile(plan.targetLogPath, nextLogContent, "utf8");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create or update log: ${plan.targetLogPath}: ${message}`);
    }
    try {
        await mkdir(dirname(plan.archivePath), { recursive: true });
        await rename(plan.sourcePath, plan.archivePath);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to archive mobile file: ${plan.sourcePath} -> ${plan.archivePath}: ${message}`);
    }
}
async function importMobileFiles(importPath, outputDir, dryRun) {
    const plans = await collectMobileImportPlans(importPath, outputDir);
    for (const plan of plans) {
        await importSingleMobileFile(plan, dryRun);
    }
    return plans;
}
function formatMobileImportPlan(plan, dryRun) {
    const prefix = dryRun ? "[dry-run] " : "";
    return [
        `${prefix}Read: ${plan.sourcePath}`,
        `${prefix}Append to: ${plan.targetLogPath}`,
        `${prefix}Archive to: ${plan.archivePath}`,
    ];
}
export function formatHelp() {
    return HELP_TEXT;
}
export function formatAdviceInput(logContents) {
    return [
        "# Recent logs for reflection",
        "",
        logContents.join("\n\n"),
        "",
        "# Reflection questions",
        "",
        "- この3件のログの間で、何が変化しましたか？",
        "- 繰り返し現れている感情やパターンはありますか？",
        "- 次にできる小さな行動は何ですか？",
    ].join("\n");
}
export function formatMonthlyTrendSummary(monthlyTrend) {
    if (monthlyTrend === "improving") {
        return "Logging is improving this month.";
    }
    if (monthlyTrend === "declining") {
        return "Logging is declining this month.";
    }
    return "Logging is steady this month.";
}
export function formatStats(stats) {
    return [
        `Log files: ${stats.totalFiles}`,
        `Log entries: ${stats.totalEntries}`,
        `Average entries per log day: ${stats.averageEntriesPerLogDay.toFixed(1)}`,
        `Most entries in a day: ${stats.maxEntriesPerDay}`,
        `Most active day: ${stats.mostActiveDay ?? "none"}`,
        `Latest log: ${stats.latestLog ?? "none"}`,
        `Oldest log: ${stats.oldestLog ?? "none"}`,
        `Days since last log: ${stats.daysSinceLastLog}`,
        `Current streak: ${stats.currentStreak}`,
        `Longest streak: ${stats.longestStreak}`,
        `Log days this month: ${stats.logDaysThisMonth}`,
        `Log rate this month: ${stats.logRateThisMonth.toFixed(1)}%`,
        `Log days last month: ${stats.logDaysLastMonth}`,
        `Log rate last month: ${stats.logRateLastMonth.toFixed(1)}%`,
        `Log rate change: ${stats.logRateChangeText}%`,
        `Monthly trend: ${stats.monthlyTrend}`,
        `Summary: ${formatMonthlyTrendSummary(stats.monthlyTrend)}`,
        `Log days change: ${stats.logDaysChangeText}`,
    ].join("\n");
}
export async function runCli(args = process.argv.slice(2)) {
    const parsed = parseArgs(args);
    if (parsed.help) {
        return {
            filePath: null,
            help: true,
            stats: null,
            safeShareText: null,
            mobileImportPlans: null,
            dryRun: false,
            adviceContent: null,
        };
    }
    if (parsed.monthlySummaryMonth !== null) {
        return {
            filePath: await writeMonthlySummary(parsed.monthlySummaryMonth, parsed.outputDir),
            help: false,
            stats: null,
            safeShareText: null,
            mobileImportPlans: null,
            dryRun: false,
            adviceContent: null,
        };
    }
    if (parsed.weeklySummaryWeek !== null) {
        return {
            filePath: await writeWeeklySummary(parsed.weeklySummaryWeek, parsed.outputDir),
            help: false,
            stats: null,
            safeShareText: null,
            mobileImportPlans: null,
            dryRun: false,
            adviceContent: null,
        };
    }
    if (parsed.stats) {
        return {
            filePath: null,
            help: false,
            stats: await getLogStats(parsed.outputDir),
            safeShareText: null,
            mobileImportPlans: null,
            dryRun: false,
            adviceContent: null,
        };
    }
    if (parsed.advice) {
        const stats = await getLogStats(parsed.outputDir);
        const logsDir = join(parsed.outputDir, DEFAULT_LOG_DIR);
        const entries = await readdir(logsDir, { withFileTypes: true });
        const logFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
        const sortedFileNames = logFiles
            .map((entry) => entry.name)
            .sort();
        const recentFileNames = sortedFileNames.slice(-3);
        if (stats.latestLog === null) {
            throw new Error("No logs found for advice");
        }
        const recentLogContents = await Promise.all(recentFileNames.map(async (fileName) => {
            const filePath = join(logsDir, fileName);
            return readFile(filePath, "utf8");
        }));
        return {
            filePath: null,
            help: false,
            stats: null,
            safeShareText: null,
            mobileImportPlans: null,
            dryRun: false,
            adviceContent: formatAdviceInput(recentLogContents),
        };
    }
    if (parsed.safeShareInput !== null) {
        const sourceText = await resolveSafeShareInput(parsed.safeShareInput);
        return {
            filePath: null,
            help: false,
            stats: null,
            safeShareText: sanitizeForSafeShare(sourceText),
            mobileImportPlans: null,
            dryRun: false,
            adviceContent: null,
        };
    }
    if (parsed.importMobilePath !== null) {
        return {
            filePath: null,
            help: false,
            stats: null,
            safeShareText: null,
            mobileImportPlans: await importMobileFiles(parsed.importMobilePath, parsed.outputDir, parsed.dryRun),
            dryRun: parsed.dryRun,
            adviceContent: null,
        };
    }
    const content = renderLog(parsed.memo, parsed.date);
    return {
        filePath: await writeLogFile(parsed.date, content, parsed.outputDir),
        help: false,
        stats: null,
        safeShareText: null,
        mobileImportPlans: null,
        dryRun: false,
        adviceContent: null,
    };
}
const isDirectExecution = process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
    void runCli()
        .then((result) => {
        if (result.help) {
            console.log(formatHelp());
            return;
        }
        if (result.stats !== null) {
            console.log(formatStats(result.stats));
            return;
        }
        if (result.adviceContent !== null) {
            console.log(result.adviceContent);
            return;
        }
        if (result.safeShareText !== null) {
            console.log(result.safeShareText);
            return;
        }
        if (result.mobileImportPlans !== null) {
            for (const plan of result.mobileImportPlans) {
                for (const line of formatMobileImportPlan(plan, result.dryRun)) {
                    console.log(line);
                }
            }
            return;
        }
        if (result.filePath !== null) {
            if (result.filePath.includes("/monthly-summary/")) {
                const month = result.filePath.match(/(\d{4}-\d{2})\.md$/)?.[1] ?? "";
                console.log(`Saved monthly summary: ${result.filePath} (${month})`);
            }
            else if (result.filePath.includes("/weekly-summary/")) {
                const week = result.filePath.match(/(\d{4}-W\d{2})\.md$/)?.[1] ?? "";
                console.log(`Saved weekly summary: ${result.filePath} (${week})`);
            }
            else {
                const date = result.filePath.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? "";
                console.log(`Saved log: ${result.filePath} (${date})`);
            }
        }
    })
        .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`mental-auto failed: ${message}`);
        process.exitCode = 1;
    });
}
