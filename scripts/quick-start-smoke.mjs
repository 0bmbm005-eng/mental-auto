import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function todayInJst() {
  const parts = dateFormatter.formatToParts(new Date());
  const part = (type) => parts.find((value) => value.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function smokeTest() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cwd = await mkdtemp(join(tmpdir(), "mental-auto-smoke-"));
    try {
      const date = todayInJst();
      const firstMemo = "今日は少し疲れた";
      const secondMemo = "夜は少し休めた";
      const options = { cwd, env: { ...process.env, TZ: "UTC" }, timeout: 10_000 };
      await run(process.execPath, [cli, firstMemo], options);
      const logs = join(cwd, "logs");
      const firstFiles = await readdir(logs);
      // Read the actual file so a midnight rollover can be retried below.
      assert.equal(firstFiles.length, 1);
      const firstContent = await readFile(join(logs, firstFiles[0]), "utf8");
      await run(process.execPath, [cli, secondMemo], options);
      const explicitCwd = join(cwd, "explicit-cwd");
      const outputDir = join(cwd, "custom-output");
      const outputMemo = "指定した出力先へのメモ";
      await mkdir(explicitCwd);
      await run(process.execPath, [cli, "--output-dir", outputDir, outputMemo], {
        ...options,
        cwd: explicitCwd,
      });
      const outputLogs = join(outputDir, "logs");
      const outputFiles = await readdir(outputLogs);
      assert.equal(outputFiles.length, 1);
      const outputContent = await readFile(join(outputLogs, outputFiles[0]), "utf8");
      await assert.rejects(readdir(join(explicitCwd, "logs")), { code: "ENOENT" });

      const endDate = todayInJst();
      if (date !== endDate) {
        console.log("JST date changed during smoke test; retrying in a fresh directory.");
        continue;
      }

      assert.deepEqual(firstFiles, [`${date}.md`]);
      assert.equal(firstContent, `# ${date}\n\n${firstMemo}\n`);
      assert.deepEqual(outputFiles, [`${date}.md`]);
      assert.equal(outputContent, `# ${date}\n\n${outputMemo}\n`);
      assert.deepEqual(await readdir(logs), [`${date}.md`]);
      const content = await readFile(join(logs, `${date}.md`), "utf8");
      assert.ok(content.startsWith(firstContent), "The first memo must be preserved");
      assert.match(content.slice(firstContent.length), new RegExp(
        `^\\n## Entry ${date} \\d{2}:\\d{2}:\\d{2} JST\\n\\n${secondMemo}\\n$`,
      ));
      console.log(`Quick Start smoke test passed (${date} JST).`);
      return;
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
  throw new Error("JST date changed during all 3 smoke test attempts");
}

await smokeTest();
