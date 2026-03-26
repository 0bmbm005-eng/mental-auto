import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getJstDateString,
  renderLog,
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
    expect(renderLog("", "2026-03-26")).toBe("# 2026-03-26\n\n\n");
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
