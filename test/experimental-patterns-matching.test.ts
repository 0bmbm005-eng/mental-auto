import { beforeEach, expect, it, vi } from "vitest";
import { createOllamaAdviceProvider } from "../src/index.js";
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
  otherSummary: "リビングの机を拭く",
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
    otherSummary: "寝室の机を拭く",
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

it("extends an existing repeated pattern with an alias on the third day", async () => {
  const existing = { summary: candidate.summary, evidenceDates: dates.slice(0, 2) };
  helper.output = JSON.stringify({
    patterns: [existing],
    candidates: [{ ...candidate, evidenceDates: dates }],
  });
  const extract = await createExperimentalPatterns(async request =>
    "actions" in request.format.properties
      ? '{"actions":[]}' : '{"decision":"同じ対象"}');
  await expect(extract([], "model")).resolves.toEqual([{
    summary: candidate.summary, evidenceDates: dates,
  }]);
});

it.each([true, false])("merges aliases only with all pair matches confirmed (%s)", async allMatch => {
  const names = ["居間の机を拭く", "リビングの机を拭く", "居室の机を拭く"];
  const pairs = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => ({
    targets: [names[a], names[b]],
    summary: names[a], otherSummary: names[b],
    evidenceDates: [dates[a], dates[b]],
  }));
  helper.output = JSON.stringify({ patterns: [], candidates: pairs });
  let index = 0;
  const extract = await createExperimentalPatterns(async request => {
    if ("actions" in request.format.properties) return '{"actions":[]}';
    const same = allMatch || index !== 2;
    index++;
    return JSON.stringify({ decision: same ? "同じ対象" : "別の対象" });
  });
  const output = await extract([], "model");
  expect(output).toEqual([{
    summary: names[0], evidenceDates: allMatch ? dates : dates.slice(0, 2),
  }]);
});

// This checks request wiring only; mocked responses do not establish generation quality.
it("sends the negation instruction at the end of each daily extraction system prompt", async () => {
  helper.output = JSON.stringify({ patterns: [], candidates: [] });
  const logs = [
    { date: dates[0], content: "階段の手すりを拭いた。" },
    { date: dates[1], content: "階段の手すりは拭かなかった。" },
    { date: dates[2], content: "階段の手すりは拭かなかった。洗面所の鏡を拭いた。" },
  ];
  const advice = {
    schemaVersion: 1, recordedStatements: [], selfEvaluations: [], repeatedPatterns: [],
    ruminationNotice: "", nextAction: "確認する。",
  };
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    const content = JSON.stringify("actions" in request.format.properties ? { actions: [] } : advice);
    return new Response(JSON.stringify({ message: { content } }));
  });
  await createOllamaAdviceProvider("model", undefined, fetchImpl, true)({
    schemaVersion: 1, sanitized: false, logs, logCount: logs.length, questions: [],
  });
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  const requests = fetchImpl.mock.calls.slice(1).map(([, init]) => JSON.parse(String(init?.body)));
  expect(requests.map(request => request.messages[1])).toEqual(
    logs.map(log => ({ role: "user", content: log.content })),
  );
  for (const request of requests) {
    expect(request.messages[0].role).toBe("system");
    expect(request.messages[0].content.endsWith(
      "否定・未実施として記述された行動は抽出せず、実行済み行動だけをactionsに返してください。",
    )).toBe(true);
  }
});
