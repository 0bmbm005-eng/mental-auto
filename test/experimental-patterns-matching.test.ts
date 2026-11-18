import { beforeEach, expect, it, vi } from "vitest";
import { createExperimentalPatterns } from "../src/experimental-patterns.js";

const helper = vi.hoisted(() => ({ output: "" }));
vi.mock("node:child_process", () => ({
  execFile: (_command: string, args: string[], _options: unknown,
    callback: (error: null, stdout: string, stderr: string) => void) => {
    queueMicrotask(() => callback(null, args.includes("--check") ? "" : helper.output, ""));
    return { stdin: { on: vi.fn(), end: vi.fn() } };
  },
}));

const dates = ["2026-11-12", "2026-11-13", "2026-11-14"];
const fixed = { summary: "窓を拭く", evidenceDates: dates.slice(0, 2) };
const candidate = {
  targets: ["居間の机", "リビングの机"],
  summary: "居間の机を拭く",
  evidenceDates: dates.slice(1),
};

beforeEach(() => {
  helper.output = JSON.stringify({ patterns: [fixed], candidates: [candidate] });
});

it.each([
  ["transport", async () => { throw new Error("unavailable"); }],
  ["invalid JSON", async () => "invalid"],
  ["extra field", async () => JSON.stringify({ decision: "同じ対象", extra: true })],
  ["undecided", async () => JSON.stringify({ decision: "判定保留" })],
  ["different", async () => JSON.stringify({ decision: "別の対象" })],
] as const)("preserves existing patterns on %s", async (_label, match) => {
  const post = vi.fn(async (request) =>
    "actions" in request.format.properties ? '{"actions":[]}' : match());
  const extract = await createExperimentalPatterns(post);
  await expect(extract(dates.map(date => ({ date, content: "匿名入力" })), "model"))
    .resolves.toEqual([fixed]);
  expect(post).toHaveBeenCalledTimes(4);
});

it("handles multiple candidates independently without combining evidence across pairs", async () => {
  const other = {
    targets: ["リビングの机", "寝室の机"],
    summary: "リビングの机を拭く",
    evidenceDates: [dates[0], dates[2]],
  };
  helper.output = JSON.stringify({ patterns: [fixed], candidates: [candidate, other] });
  const requests: string[] = [];
  const extract = await createExperimentalPatterns(async request => {
    if ("actions" in request.format.properties) return '{"actions":[]}';
    requests.push(request.messages[1].content);
    return JSON.stringify({ decision: requests.length === 1 ? "同じ対象" : "別の対象" });
  });
  await expect(extract(dates.map(date => ({ date, content: "匿名入力" })), "model"))
    .resolves.toEqual([fixed, {
      summary: candidate.summary, evidenceDates: candidate.evidenceDates,
    }]);
  expect(requests.map(value => JSON.parse(value))).toEqual([candidate.targets, other.targets]);
});
