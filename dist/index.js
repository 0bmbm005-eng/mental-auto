import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const JST_TIME_ZONE = "Asia/Tokyo";
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
    return `# ${date}\n\n${memo}\n`;
}
export async function writeLogFile(date, content, baseDir = process.cwd()) {
    const logsDir = join(baseDir, "logs");
    const filePath = join(logsDir, `${date}.md`);
    await mkdir(logsDir, { recursive: true });
    await writeFile(filePath, content, "utf8");
    return filePath;
}
export async function runCli(args = process.argv.slice(2)) {
    const memo = args.join(" ");
    const date = getJstDateString(new Date());
    const content = renderLog(memo, date);
    return writeLogFile(date, content);
}
const isDirectExecution = process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
    void runCli().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
