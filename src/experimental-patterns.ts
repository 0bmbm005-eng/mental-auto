import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("../src/experimental_patterns.py", import.meta.url));
const required = ["targetQuote", "action"] as const;
const format = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: { targetQuote: { type: "string" }, action: { type: "string" } },
        required,
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
} as const;

const prompt = "引用に明記された実施済み行動を抽出してください。targetQuote には行動の対象を表す、原文と完全一致する連続した引用を入れてください。対象を特定する修飾語も引用に含め、動詞や行動の程度・方法・道具は含めないでください。action は動詞の辞書形で返してください。対象や行動が不明なら推測せず、その組は返さないでください。指定のJSON形式だけで返してください。";

const decisions = ["同じ対象", "別の対象", "判定保留"] as const;
const matchingFormat = {
  type: "object",
  properties: { decision: { type: "string", enum: decisions } },
  required: ["decision"],
  additionalProperties: false,
} as const;
const matchingPrompt = "二つの対象引用が同じ対象を指すか判定してください。それぞれの引用を、場所を表す語と物を表す語に分け、場所同士と物同士を個別に意味で比較してください。場所も物も同じ意味なら「同じ対象」、場所か物のどちらかが異なる意味なら「別の対象」、判断材料が足りなければ「判定保留」としてください。指定されたJSON形式だけで返してください。";

export type PatternExtractionRequest = {
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  format: typeof format | typeof matchingFormat;
  think: false;
  stream: false;
  options: { temperature: 0 };
};

type Action = { targetQuote: string; action: string };
type Pattern = { summary: string; evidenceDates: string[] };
type Candidate = Pattern & { targets: [string, string]; otherSummary: string };

function parseActions(content: string): Action[] {
  const value: unknown = JSON.parse(content);
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 1 ||
      !("actions" in value) || !Array.isArray(value.actions) ||
      !value.actions.every((a: unknown) => typeof a === "object" && a !== null &&
        Object.keys(a).length === required.length &&
        required.every((key) => typeof (a as Record<string, unknown>)[key] === "string"))) {
    throw new Error("Invalid experimental repeatedPatterns extraction JSON");
  }
  return value.actions;
}

function runHelper(args: string[], input = ""): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("python3", ["-X", "utf8", helper, ...args], { timeout: 30_000 }, (error, stdout, stderr) => {
      if (!error) resolve(stdout);
      else if (error.code === "ENOENT") reject(new Error("Experimental repeatedPatterns requires python3 on PATH"));
      else reject(new Error(stderr.trim() || "Experimental repeatedPatterns Python helper failed"));
    });
    child.stdin?.on("error", () => { /* execFile reports startup and exit errors. */ });
    child.stdin?.end(input, "utf8");
  });
}

export async function createExperimentalPatterns(
  post: (request: PatternExtractionRequest) => Promise<string>,
): Promise<(logs: { date: string; content: string }[], model: string) => Promise<Pattern[]>> {
  await runHelper(["--check"]);
  return async (logs, model) => {
    const days = [];
    for (const { date, content } of logs) {
      const response = await post({
        model, think: false, stream: false, options: { temperature: 0 }, format,
        messages: [{ role: "system", content: prompt }, { role: "user", content }],
      });
      days.push({ date, content, actions: parseActions(response) });
    }
    const { patterns, candidates } = JSON.parse(
      await runHelper(["--semantic-candidates"], JSON.stringify(days)),
    ) as { patterns: Pattern[]; candidates: Candidate[] };
    const accepted: Candidate[] = [];
    for (const candidate of candidates) {
      const { targets } = candidate;
      try {
        const content = await post({
          model, think: false, stream: false, options: { temperature: 0 }, format: matchingFormat,
          messages: [
            { role: "system", content: matchingPrompt },
            { role: "user", content: JSON.stringify(targets) },
          ],
        });
        const result: unknown = JSON.parse(content);
        if (typeof result === "object" && result !== null && Object.keys(result).length === 1 &&
            "decision" in result && result.decision === "同じ対象") {
          accepted.push(candidate);
        }
      } catch {
        // Preserve deterministic results if the optional match cannot be evaluated.
      }
    }
    const groups = patterns.map(pattern => ({
      members: new Set([pattern.summary]),
      dates: new Set(pattern.evidenceDates),
    }));
    const matches = new Set(accepted.map(pair =>
      JSON.stringify([pair.summary, pair.otherSummary].sort())));
    for (const pair of accepted) {
      let left = groups.find(group => group.members.has(pair.summary));
      let right = groups.find(group => group.members.has(pair.otherSummary));
      if (!left) {
        left = { members: new Set([pair.summary]), dates: new Set<string>() };
        groups.push(left);
      }
      if (!right) {
        right = { members: new Set([pair.otherSummary]), dates: new Set<string>() };
        groups.push(right);
      }
      const compatible = [...left.members].every(a => [...right.members].every(b =>
        a === b || matches.has(JSON.stringify([a, b].sort()))));
      if (!compatible) continue;
      if (left !== right) {
        for (const member of right.members) left.members.add(member);
        for (const date of right.dates) left.dates.add(date);
        groups.splice(groups.indexOf(right), 1);
      }
      for (const date of pair.evidenceDates) left.dates.add(date);
    }
    return groups.filter(group => group.dates.size >= 2).map(group => ({
      summary: [...group.members][0],
      evidenceDates: [...group.dates].sort(),
    }));
  };
}
