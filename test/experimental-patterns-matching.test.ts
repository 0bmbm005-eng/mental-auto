import { execFileSync } from "node:child_process";
import { beforeEach, expect, it, vi } from "vitest";
import { createOllamaAdviceProvider } from "../src/index.js";
import { createExperimentalPatterns } from "../src/experimental-patterns.js";

const helper = vi.hoisted(() => ({ output: "" }));
vi.mock("node:child_process", async importOriginal => ({
  ...await importOriginal<typeof import("node:child_process")>(),
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

// Use the real candidate builder with a minimal tokenizer; transport stays mocked.
function candidatesFor(days: { date: string; content: string; actions: { targetQuote: string; action: string }[] }[]) {
  return execFileSync("python3", ["-B", "-c", `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("patterns", "src/experimental_patterns.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Tokenizer:
    def tokenize(self, value):
        return []
print(json.dumps(module.repeated_patterns(json.load(sys.stdin), Tokenizer(), True)))
`], { input: JSON.stringify(days), encoding: "utf8" });
}

function day(index: number, target: string, content = target) {
  return { date: dates[index], content, actions: [{ targetQuote: target, action: "拭く" }] };
}

it.each([false, true])("defers incomplete targets without calling Ollama matching (reverse=%s)", async reverse => {
  const targets = ["物置の収納ケース", "ケース"];
  if (reverse) targets.reverse();
  helper.output = candidatesFor(targets.map((target, index) => day(index, target)));
  expect(JSON.parse(helper.output)).toEqual({ patterns: [], candidates: [] });
  const post = vi.fn(async () => '{"decision":"同じ対象"}');
  const extract = await createExperimentalPatterns(post);
  await expect(extract([], "model")).resolves.toEqual([]);
  expect(post).not.toHaveBeenCalled();
});

it.each([
  ["restored place", "物置のケース", "ケース", "物置のケースを拭いた。", "物置のケースを拭く"],
  ["exact", "物置の収納ケース", "物置の収納ケース", "物置の収納ケース", "物置の収納ケースを拭く"],
  ["registered equivalent", "台所の流し", "キッチンのシンク", "キッチンのシンク", "台所の流しを拭く"],
  ["top surface", "棚", "棚の上", "棚の上", "棚を拭く"],
])("preserves deterministic matching before deferral: %s", async (_label, left, right, content, summary) => {
  helper.output = candidatesFor([day(0, left), day(1, right, content)]);
  expect(JSON.parse(helper.output).candidates).toEqual([]);
  const post = vi.fn(async () => '{"decision":"同じ対象"}');
  const extract = await createExperimentalPatterns(post);
  await expect(extract([], "model")).resolves.toEqual([{ summary, evidenceDates: dates.slice(0, 2) }]);
  expect(post).not.toHaveBeenCalled();
});

it("does not merge across a deferred pair through another accepted target", async () => {
  // A/C is deferred; A/B and B/C are accepted by the mock model.
  helper.output = candidatesFor([
    day(0, "物置の収納ケース"), day(1, "容器"), day(2, "ケース"),
  ]);
  const candidates = JSON.parse(helper.output).candidates;
  expect(candidates.map((pair: { targets: string[] }) => pair.targets)).toEqual([
    ["物置の収納ケース", "容器"], ["容器", "ケース"],
  ]);
  const post = vi.fn(async () => '{"decision":"同じ対象"}');
  const extract = await createExperimentalPatterns(post);
  await expect(extract([], "model")).resolves.toEqual([{
    summary: "物置の収納ケースを拭く", evidenceDates: dates.slice(0, 2),
  }]);
  expect(post).toHaveBeenCalledTimes(2);
});
