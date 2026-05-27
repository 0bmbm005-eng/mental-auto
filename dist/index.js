import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSafeShareInput, sanitizeForSafeShare } from "./safe-share.js";
const JST_TIME_ZONE = "Asia/Tokyo";
const DEFAULT_LOG_DIR = "logs";
const HELP_TEXT = `mental-auto

JST-based daily memo CLI. Current implementation writes one Markdown log per day.

Usage:
  mental-auto [options] [memo...]
  mental-auto --safe-share INPUT

Options:
  --date YYYY-MM-DD   Specify the log date in JST
  --memo TEXT         Pass the memo body as a single argument
  --output-dir PATH   Write logs under PATH/logs
  --safe-share INPUT  Print AI-share-safe text to stdout
  --help, -h          Show this help

Examples:
  mental-auto "今日は少し疲れた"
  mental-auto --date 2026-03-26 "今日は少し疲れた"
  mental-auto --memo "今日は気分が重い"
  mental-auto --output-dir ./tmp "退避メモ"
  mental-auto --safe-share "contact me at foo@example.com"
  mental-auto --safe-share logs/2026-03-26.md
  mental-auto --help

Behavior:
  - Default output: ./logs/YYYY-MM-DD.md
  - --output-dir PATH writes to PATH/logs/YYYY-MM-DD.md
  - The date is determined in JST unless --date is specified
  - --safe-share reads text or a local file and prints sanitized text to stdout
  - same-day append is not implemented
  - Re-running on the same date overwrites logs/YYYY-MM-DD.md
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
export async function writeLogFile(date, content, baseDir = process.cwd()) {
    const logsDir = join(baseDir, DEFAULT_LOG_DIR);
    const filePath = join(logsDir, `${date}.md`);
    await mkdir(logsDir, { recursive: true });
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
        if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        }
        if (!memoSpecified) {
            memoParts.push(arg);
        }
    }
    return { memo: memoParts.join(" "), date, outputDir, help, safeShareInput };
}
export function formatHelp() {
    return HELP_TEXT;
}
export async function runCli(args = process.argv.slice(2)) {
    const parsed = parseArgs(args);
    if (parsed.help) {
        return { filePath: null, help: true, safeShareText: null };
    }
    if (parsed.safeShareInput !== null) {
        const sourceText = await resolveSafeShareInput(parsed.safeShareInput);
        return {
            filePath: null,
            help: false,
            safeShareText: sanitizeForSafeShare(sourceText),
        };
    }
    const content = renderLog(parsed.memo, parsed.date);
    return {
        filePath: await writeLogFile(parsed.date, content, parsed.outputDir),
        help: false,
        safeShareText: null,
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
