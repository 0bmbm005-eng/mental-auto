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
  mental-auto --import-mobile FILE_OR_DIR [--dry-run]

Options:
  --date YYYY-MM-DD   Specify the log date in JST
  --memo TEXT         Pass the memo body as a single argument
  --output-dir PATH   Write logs under PATH/logs
  --import-mobile X   Import mobile inbox Markdown file(s)
  --dry-run           Show import-mobile actions without changing files
  --safe-share INPUT  Print AI-share-safe text to stdout
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
  mental-auto --help

Behavior:
  - Default output: ./logs/YYYY-MM-DD.md
  - --output-dir PATH writes to PATH/logs/YYYY-MM-DD.md
  - The date is determined in JST unless --date is specified
  - Re-running on the same date appends a timestamped entry
  - --import-mobile reads YYYY-MM-DD.md and appends it under "## Mobile notes"
  - Imported files are moved to mobile-inbox/archive/
  - --dry-run only reports planned import-mobile actions
  - --safe-share reads text or a local file and prints sanitized text to stdout
  - Empty memo writes "_No memo provided_"

logs / mirror-logs:
  - logs/: implemented primary output directory
  - mirror-logs/: not implemented; no files are generated

Unimplemented options:
  - --stats
  - --advice
  - --mirror-stats
  - --mirror-advice
  These currently fail with: mental-auto failed: Unknown option: --stats
`;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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
export function renderLog(memo = "", date) {
    const body = memo.trim();
    return [`# ${date}`, "", body === "" ? "_No memo provided_" : body, ""].join("\n");
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
    let memoSpecified = false;
    let safeShareInput = null;
    let importMobilePath = null;
    let dryRun = false;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") {
            help = true;
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
        safeShareInput,
        importMobilePath,
        dryRun,
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
export async function runCli(args = process.argv.slice(2)) {
    const parsed = parseArgs(args);
    if (parsed.help) {
        return {
            filePath: null,
            help: true,
            safeShareText: null,
            mobileImportPlans: null,
            dryRun: false,
        };
    }
    if (parsed.safeShareInput !== null) {
        const sourceText = await resolveSafeShareInput(parsed.safeShareInput);
        return {
            filePath: null,
            help: false,
            safeShareText: sanitizeForSafeShare(sourceText),
            mobileImportPlans: null,
            dryRun: false,
        };
    }
    if (parsed.importMobilePath !== null) {
        return {
            filePath: null,
            help: false,
            safeShareText: null,
            mobileImportPlans: await importMobileFiles(parsed.importMobilePath, parsed.outputDir, parsed.dryRun),
            dryRun: parsed.dryRun,
        };
    }
    const content = renderLog(parsed.memo, parsed.date);
    return {
        filePath: await writeLogFile(parsed.date, content, parsed.outputDir),
        help: false,
        safeShareText: null,
        mobileImportPlans: null,
        dryRun: false,
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
            const date = result.filePath.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? "";
            console.log(`Saved log: ${result.filePath} (${date})`);
        }
    })
        .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`mental-auto failed: ${message}`);
        process.exitCode = 1;
    });
}
