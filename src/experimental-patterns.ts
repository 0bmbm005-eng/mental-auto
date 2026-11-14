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

export type PatternExtractionRequest = {
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  format: typeof format;
  think: false;
  stream: false;
  options: { temperature: 0 };
};

type Action = { targetQuote: string; action: string };
type Pattern = { summary: string; evidenceDates: string[] };

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
    return JSON.parse(await runHelper([], JSON.stringify(days))) as Pattern[];
  };
}
