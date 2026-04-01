import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { readLinesFromStream } from "../src/line-reader.js";

describe("readLinesFromStream", () => {
  it("keeps matches intact across chunk boundaries", async () => {
    const lines: string[] = [];
    const result = await readLinesFromStream({
      stream: Readable.from([
        Buffer.from('const key = "sk-abcdef'),
        Buffer.from('ghijklmnopqrstuvwxyz1234";\n'),
      ]),
      maxLineBytes: 1024,
      onLine: async (line) => {
        lines.push(line);
      },
    });

    expect(result.kind).toBe("text");
    expect(result.oversizedLines).toEqual([]);
    expect(lines).toEqual(['const key = "sk-abcdefghijklmnopqrstuvwxyz1234";']);
  });

  it("reports oversized lines and resumes on the next line", async () => {
    const lines: string[] = [];
    const result = await readLinesFromStream({
      stream: Readable.from([
        Buffer.from("12345"),
        Buffer.from("67890"),
        Buffer.from("1\nsafe-line\n"),
      ]),
      maxLineBytes: 10,
      onLine: async (line) => {
        lines.push(line);
      },
    });

    expect(result.kind).toBe("text");
    expect(result.oversizedLines).toEqual([
      { lineNumber: 1, byteLength: 11 },
    ]);
    expect(lines).toEqual(["safe-line"]);
  });
});
