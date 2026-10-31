import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  ADVICE_OUTPUT_JSON_SCHEMA,
  buildAdviceInput,
  buildOllamaAdviceRequest,
  createOllamaAdviceProvider,
  generateAdvice,
  parseAdviceOutput,
  validateAdviceEvidenceDates,
  countLogEntries,
  formatAdviceInput,
  getLogStats,
  formatHelp,
  formatMonthlyTrendSummary,
  formatStats,
  getJstDateString,
  getJstWeekString,
  renderAppendEntry,
  renderLog,
  renderMonthlySummary,
  renderWeeklySummary,
  runCli,
  writeLogFile,
  writeMonthlySummary,
  writeWeeklySummary,
  type AdviceOutput,
  type AdviceProvider,
  type OllamaAdviceMessage,
  type OllamaAdviceRequest,
} from "../src/index.js";

// Inclusion checks only; mocked responses do not evaluate generation quality.
const PATTERN_REVIEW_POLICIES = [
  "repeatedPatternsの要約候補を、対象・行動・希望／目的・程度／頻度／継続の要素に分け、各根拠日の本文と照合してください。",
  "裏付けのない要素は削るか、成立する根拠日の部分集合へ絞ってください。",
  "回数・時間から深さや目的を補わず、希望を実施済みの行動に変えないでください。",
  "修正後の要約全体が、残したすべての根拠日で成立し、重複のない2日以上になる場合のみ出力してください。",
  "成立しない候補は除外し、別の根拠ある繰り返しは保持してください。",
];

describe("buildAdviceInput", () => {
  it("builds a versioned input while preserving log order", () => {
    const logs = [
      { date: "2026-09-25", content: "first log" },
      { date: "2026-09-26", content: "second log" },
      { date: "2026-09-27", content: "third log" },
    ];

    expect(buildAdviceInput(logs)).toEqual({
      schemaVersion: 1,
      logCount: 3,
      logs,
      questions: [
        "この3件のログの間で、何が変化しましたか？",
        "繰り返し現れている感情やパターンはありますか？",
        "次にできる小さな行動は何ですか？",
      ],
      sanitized: false,
    });
  });

  it("does not mutate or retain references to the input logs", () => {
    const logs = [{ date: "2026-09-27", content: "original" }];
    const result = buildAdviceInput(logs, true);

    expect(result.sanitized).toBe(true);
    expect(result.logs).not.toBe(logs);
    expect(result.logs[0]).not.toBe(logs[0]);

    result.logs[0].content = "changed";
    expect(logs).toEqual([{ date: "2026-09-27", content: "original" }]);
  });
});

describe("buildOllamaAdviceRequest", () => {
  it("includes the model, fixed options, output schema, and system policy", () => {
    const request: OllamaAdviceRequest = buildOllamaAdviceRequest(
      buildAdviceInput([]),
      "local-model:latest",
    );
    const systemMessage: OllamaAdviceMessage = request.messages[0];

    expect(request).toEqual({
      model: "local-model:latest",
      messages: [systemMessage, { role: "user", content: JSON.stringify(buildAdviceInput([])) }],
      stream: false,
      think: false,
      options: { temperature: 0 },
      format: ADVICE_OUTPUT_JSON_SCHEMA,
    });
    expect(systemMessage.role).toBe("system");
    for (const policy of [
      "JSONだけを返してください",
      "ログに明記された内容とモデルの推測を分け",
      "selfEvaluationsには、本人が明記した自己評価だけ",
      "repeatedPatternsは、複数の日付で確認できる内容だけ",
      ...PATTERN_REVIEW_POLICIES,
      "evidenceDatesには、実際に根拠がある日付だけ",
      "反芻を診断・断定しない",
      "追加の反省・分析・作業継続を促さない",
      "休息や注意の切り替えを含む小さな行動の中から1つだけ",
    ]) {
      expect(systemMessage.content).toContain(policy);
    }
  });



  it("serializes every input field without changing input or log order", () => {
    const input = buildAdviceInput([
      { date: "2026-10-02", content: 'メモ\n"引用"と\\文字' },
      { date: "2026-10-01", content: "前日のメモ" },
    ], true);
    input.questions = ["独自の質問"];
    const original = structuredClone(input);
    Object.freeze(input.logs[0]);
    Object.freeze(input.logs[1]);
    Object.freeze(input.logs);
    Object.freeze(input.questions);
    Object.freeze(input);

    const request = buildOllamaAdviceRequest(input, "another-model");

    expect(request.messages[1].role).toBe("user");
    expect(JSON.parse(request.messages[1].content)).toEqual(original);
    expect(input).toEqual(original);
  });
});

describe("parseAdviceOutput", () => {
  it("parses a valid AdviceOutput", () => {
    const expected: AdviceOutput = {
      schemaVersion: 1,
      recordedStatements: [
        { date: "2026-10-06", statement: "落ち着いて作業できた" },
      ],
      selfEvaluations: [
        { date: "2026-10-06", statement: "今日は調子がよかった" },
      ],
      repeatedPatterns: [
        {
          summary: "短時間でも作業を継続している",
          evidenceDates: ["2026-10-05", "2026-10-06"],
        },
      ],
      ruminationNotice: "反芻の断定はできません。",
      nextAction: "5分休む",
    };

    expect(parseAdviceOutput(JSON.stringify(expected))).toEqual(expected);
  });

  it("rejects invalid JSON and incomplete output", () => {
    const invalidOutputs = [
      "not JSON",
      JSON.stringify({
        schemaVersion: 1,
        recordedStatements: [],
        selfEvaluations: [],
        repeatedPatterns: [],
        ruminationNotice: "",
      }),
    ];

    for (const content of invalidOutputs) {
      expect(() => parseAdviceOutput(content)).toThrow(
        "Invalid AdviceOutput",
      );
    }
  });
});

describe("validateAdviceEvidenceDates", () => {
  describe.each(["recordedStatements", "selfEvaluations"] as const)("%s dates", (field) => {
    it.each([false, true])("validates dates without mutation (invalid: %s)", (invalid) => {
      const { input, output } = fixtures();
      output[field] = [
        { date: "2026-10-05", statement: "最初の記述" },
        { date: invalid ? "2026-10-07" : "2026-10-06", statement: "次の記述" },
      ];
      const originalInput = structuredClone(input);
      const originalOutput = structuredClone(output);

      if (invalid) {
        expect(() => validateAdviceEvidenceDates(input, output)).toThrow(
          `${field}[1].date contains date not found in input.logs: 2026-10-07`,
        );
      } else {
        expect(validateAdviceEvidenceDates(input, output)).toBeUndefined();
      }
      expect(input).toEqual(originalInput);
      expect(output).toEqual(originalOutput);
    });

    it("allows multiple statements on the same date", () => {
      const { input, output } = fixtures();
      output[field] = [
        { date: "2026-10-05", statement: "朝の記述" },
        { date: "2026-10-05", statement: "夜の記述" },
      ];
      expect(validateAdviceEvidenceDates(input, output)).toBeUndefined();
    });

    it("allows empty arrays without input logs", () => {
      const { output } = fixtures();
      output.repeatedPatterns = [];
      expect(output[field]).toEqual([]);
      expect(validateAdviceEvidenceDates(buildAdviceInput([]), output)).toBeUndefined();
    });
  });

  function fixtures(evidenceDates = ["2026-10-05", "2026-10-06"]) {
    const input = buildAdviceInput([
      { date: "2026-10-06", content: "second log" },
      { date: "2026-10-05", content: "first log" },
    ]);
    const output: AdviceOutput = {
      schemaVersion: 1,
      recordedStatements: [],
      selfEvaluations: [],
      repeatedPatterns: [{ summary: "継続している", evidenceDates }],
      ruminationNotice: "",
      nextAction: "休む",
    };
    return { input, output };
  }

  it("accepts dates present in input logs", () => {
    const { input, output } = fixtures();
    expect(validateAdviceEvidenceDates(input, output)).toBeUndefined();
  });

  it("allows the same dates across different patterns", () => {
    const { input, output } = fixtures();
    output.repeatedPatterns.push({
      summary: "別のパターン",
      evidenceDates: ["2026-10-06", "2026-10-05"],
    });
    expect(validateAdviceEvidenceDates(input, output)).toBeUndefined();
  });

  it("rejects a date absent from input logs", () => {
    const { input, output } = fixtures(["2026-10-05", "2026-10-07"]);
    expect(() => validateAdviceEvidenceDates(input, output)).toThrow(
      "repeatedPatterns[0].evidenceDates contains date not found in input.logs: 2026-10-07",
    );
  });

  it("rejects duplicate dates within a pattern", () => {
    const { input, output } = fixtures(["2026-10-05", "2026-10-06", "2026-10-05"]);
    expect(() => validateAdviceEvidenceDates(input, output)).toThrow(
      "repeatedPatterns[0].evidenceDates contains duplicate date: 2026-10-05",
    );
  });

  it.each([["2026-10-05"], []])("rejects insufficient evidence dates: %j", (...dates) => {
    const { input, output } = fixtures(dates);
    expect(() => validateAdviceEvidenceDates(input, output)).toThrow(
      "repeatedPatterns[0].evidenceDates must contain at least 2 dates",
    );
  });

  it("accepts an empty repeatedPatterns array even without logs", () => {
    const { output } = fixtures();
    output.repeatedPatterns = [];
    expect(validateAdviceEvidenceDates(buildAdviceInput([]), output)).toBeUndefined();
  });

  it.each([
    ["2026-10-05", "2026-10-06"],
    ["2026-10-05", "2026-10-07"],
    ["2026-10-05", "2026-10-05"],
    ["2026-10-05"],
    [],
  ])("does not mutate either argument: %j", (...dates) => {
    const { input, output } = fixtures(dates);
    const originalInput = structuredClone(input);
    const originalOutput = structuredClone(output);

    try {
      validateAdviceEvidenceDates(input, output);
    } catch {
      // Invalid evidence must also leave both arguments unchanged.
    }

    expect(input).toEqual(originalInput);
    expect(output).toEqual(originalOutput);
  });
});

describe("createOllamaAdviceProvider", () => {
  it.each(["recordedStatements", "selfEvaluations", "repeatedPatterns"] as const)(
    "applies %s date validation in the Ollama generation path",
    async (field) => {
      const input = buildAdviceInput([
        { date: "2026-10-05", content: "最初のログ" },
        { date: "2026-10-06", content: "次のログ" },
      ]);
      const output: AdviceOutput = {
        schemaVersion: 1,
        recordedStatements: [{ date: "2026-10-05", statement: "記述" }],
        selfEvaluations: [{ date: "2026-10-06", statement: "自己評価" }],
        repeatedPatterns: [{ summary: "パターン", evidenceDates: ["2026-10-05", "2026-10-06"] }],
        ruminationNotice: "",
        nextAction: "休む",
      };
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        message: { content: JSON.stringify(output) },
      })));
      const provider = createOllamaAdviceProvider("local-model", undefined, fetchMock as typeof fetch);
      await expect(generateAdvice(input, provider)).resolves.toBe(JSON.stringify(output));

      if (field === "repeatedPatterns") {
        output.repeatedPatterns[0].evidenceDates[1] = "2026-10-07";
      } else {
        output[field][0].date = "2026-10-07";
      }
      const path = field === "repeatedPatterns" ? `${field}[0].evidenceDates` : `${field}[0].date`;
      await expect(generateAdvice(input, provider)).rejects.toThrow(
        `${path} contains date not found in input.logs: 2026-10-07`,
      );
    },
  );

  it("posts an Ollama request and returns the assistant content", async () => {
    const input = buildAdviceInput([
      { date: "2026-10-06", content: "今日は落ち着いて作業できた" },
    ]);
    const content = JSON.stringify({
      schemaVersion: 1,
      recordedStatements: [],
      selfEvaluations: [],
      repeatedPatterns: [],
      ruminationNotice: "",
      nextAction: "少し休む",
    } satisfies AdviceOutput);
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: { role: "assistant", content },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const provider = createOllamaAdviceProvider(
      "local-model:latest",
      "http://127.0.0.1:11434/api/chat",
      fetchMock as typeof fetch,
    );

    const result = await provider(input);

    expect(result).toBe(content);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildOllamaAdviceRequest(input, "local-model:latest"),
        ),
      },
    );
  });

  it("includes classification and evidence policies in the posted request (not a quality evaluation)", async () => {
    const input = buildAdviceInput([{ date: "2026-10-01", content: "架空の記録" }]);
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      message: { content: JSON.stringify({
        schemaVersion: 1, recordedStatements: [], selfEvaluations: [],
        repeatedPatterns: [], ruminationNotice: "", nextAction: "休む",
      } satisfies AdviceOutput) },
    })));
    await createOllamaAdviceProvider("local-model", undefined, fetchMock as typeof fetch)(input);

    // Inspect the serialized HTTP body, independently of the request builder.
    // A mocked response cannot demonstrate the model's classification or summary quality.
    const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(request.messages[0].role).toBe("system");
    for (const policy of [
      ...PATTERN_REVIEW_POLICIES,
      "本人による自分の能力・性質・行動などへの評価",
      "他者の気持ちの推測はselfEvaluationsから除外し、推測表現を保ってrecordedStatementsに残してください",
      "『嫌われた気がする』は他者の気持ちの推測、『自分は会話が下手だと思った』は自己評価",
      "両配列への同じ記述の重複自体は禁止しません",
      "記載された行動・希望・目的を区別し、要約は列挙した各evidenceDatesの本文で裏付けられる共通内容に限定",
      "単日の希望・目的を、他日の実施済み行動や複数日の傾向へ広げない",
      "根拠のある繰り返しは拾い、共通内容を確保できない場合はrepeatedPatternsを空配列",
    ]) {
      expect(request.messages[0].content).toContain(policy);
    }
    expect(JSON.parse(request.messages[1].content)).toEqual(input);
  });

  it("guides users on connection failures and preserves the cause", async () => {
    const input = buildAdviceInput([
      { date: "2026-10-06", content: "今日の記録" },
    ]);
    const error = new TypeError("fetch failed");
    const fetchMock = vi.fn().mockRejectedValue(error);
    const provider = createOllamaAdviceProvider(
      "local-model:latest",
      "http://127.0.0.1:11434/api/chat",
      fetchMock as typeof fetch,
    );

    const result = provider(input);
    await expect(result).rejects.toThrow(
      "Ollamaに接続できませんでした。Ollamaが起動しているか、接続先 http://127.0.0.1:11434/api/chat が正しいか確認してください。",
    );
    await expect(result).rejects.toHaveProperty("cause", error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unsuccessful HTTP responses", async () => {
    const input = buildAdviceInput([
      { date: "2026-10-08", content: "今日の記録" },
    ]);
    const fetchMock = vi.fn(async () =>
      new Response("Service unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );
    const provider = createOllamaAdviceProvider(
      "local-model:latest",
      "http://127.0.0.1:11434/api/chat",
      fetchMock as typeof fetch,
    );

    await expect(provider(input)).rejects.toThrow(
      "Ollama request failed: 503 Service Unavailable",
    );
  });

  it("rejects a response without assistant content", async () => {
    const input = buildAdviceInput([
      { date: "2026-10-06", content: "今日の記録" },
    ]);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = createOllamaAdviceProvider(
      "local-model:latest",
      "http://127.0.0.1:11434/api/chat",
      fetchMock as typeof fetch,
    );

    await expect(provider(input)).rejects.toThrow(
      "Invalid Ollama response",
    );
  });

  it("rejects invalid AdviceOutput content", async () => {
    const input = buildAdviceInput([
      { date: "2026-10-07", content: "今日の記録" },
    ]);
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: JSON.stringify({ schemaVersion: 1 }),
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const provider = createOllamaAdviceProvider(
      "local-model:latest",
      "http://127.0.0.1:11434/api/chat",
      fetchMock as typeof fetch,
    );

    await expect(provider(input)).rejects.toThrow(
      "Invalid AdviceOutput",
    );
  });
});


describe("ADVICE_OUTPUT_JSON_SCHEMA", () => {
  it("defines all output fields, nested requirements, and closed objects", () => {
    const output: AdviceOutput = {
      schemaVersion: 1,
      recordedStatements: [],
      selfEvaluations: [],
      repeatedPatterns: [],
      ruminationNotice: "",
      nextAction: "少し休む",
    };
    const statementSchema = {
      type: "object",
      properties: { date: { type: "string" }, statement: { type: "string" } },
      required: ["date", "statement"],
      additionalProperties: false,
    };

    expect(ADVICE_OUTPUT_JSON_SCHEMA).toEqual({
      type: "object",
      properties: {
        schemaVersion: { type: "integer", const: 1 },
        recordedStatements: { type: "array", items: statementSchema },
        selfEvaluations: { type: "array", items: statementSchema },
        repeatedPatterns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              summary: { type: "string" },
              evidenceDates: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "evidenceDates"],
            additionalProperties: false,
          },
        },
        ruminationNotice: { type: "string" },
        nextAction: { type: "string" },
      },
      required: Object.keys(output),
      additionalProperties: false,
    });
  });
});

describe("generateAdvice", () => {
  it("passes the input to the provider and returns its response", async () => {
    const input = buildAdviceInput([
      { date: "2026-09-27", content: "今日は落ち着いて過ごせた" },
    ]);
    const provider = vi.fn().mockResolvedValue("小さな変化を振り返ろう");

    const result = await generateAdvice(input, provider);

    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledWith(input);
    expect(result).toBe("小さな変化を振り返ろう");
  });

  it("propagates provider errors", async () => {
    const input = buildAdviceInput([
      { date: "2026-10-02", content: "今日の記録" },
    ]);
    const error = new Error("接続に失敗しました");
    const provider = vi.fn().mockRejectedValue(error);

    await expect(generateAdvice(input, provider)).rejects.toBe(error);
  });
});

describe("formatAdviceInput", () => {
  it("joins multiple log contents with blank lines", () => {
    const result = formatAdviceInput([
      "first log",
      "second log",
      "third log",
    ]);

    expect(result).toBe(
      [
        "# Recent logs for reflection",
        "",
        "first log",
        "",
        "second log",
        "",
        "third log",
        "",
        "# Reflection questions",
        "",
        "- この3件のログの間で、何が変化しましたか？",
        "- 繰り返し現れている感情やパターンはありますか？",
        "- 次にできる小さな行動は何ですか？",
      ].join("\n"),
    );
  });
});

describe("getJstDateString", () => {
  it("formats a date in JST as YYYY-MM-DD", () => {
    const utc = new Date("2026-03-25T18:30:00.000Z");

    expect(getJstDateString(utc)).toBe("2026-03-26");
  });
});

describe("getJstWeekString", () => {
  it("formats a date as an ISO week in JST", () => {
    expect(getJstWeekString(new Date("2026-03-25T18:30:00.000Z"))).toBe("2026-W13");
  });

  it("handles ISO weeks at a year boundary", () => {
    expect(getJstWeekString(new Date("2021-01-01T00:00:00.000Z"))).toBe("2020-W53");
    expect(getJstWeekString(new Date("2021-01-04T00:00:00.000Z"))).toBe("2021-W01");
  });
});

describe("renderLog", () => {
  it("renders the date and memo", () => {
    expect(renderLog("メモ内容", "2026-03-26")).toBe(
      "# 2026-03-26\n\nメモ内容\n",
    );
  });

  it("accepts an empty memo", () => {
    expect(renderLog("", "2026-03-26")).toBe(
      "# 2026-03-26\n\n_No memo provided_\n",
    );
  });
});

describe("renderAppendEntry", () => {
  it("renders an appended entry with an injected timestamp", () => {
    expect(
      renderAppendEntry(
        "2026-03-26",
        renderLog("夜のメモ", "2026-03-26"),
        "2026-03-26 21:15:30 JST",
      ),
    ).toBe("## Entry 2026-03-26 21:15:30 JST\n\n夜のメモ\n");
  });
});

describe("countLogEntries", () => {
  it("counts the initial log and appended entries", () => {
    const content =
      "# 2026-03-26\n\n最初のメモ\n\n" +
      "## Entry 2026-03-26 12:00:00 JST\n\n2回目\n\n" +
      "## Entry 2026-03-26 18:00:00 JST\n\n3回目\n";

    expect(countLogEntries(content)).toBe(3);
  });
});

describe("getLogStats", () => {
  it("counts markdown log files", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    await mkdir(join(baseDir, "logs"));
    await writeFile(
  join(baseDir, "logs", "2026-03-26.md"),
  "# 2026-03-26\n\n最初の記録\n\n## Entry 12:00\n\n2回目\n\n## Entry 20:00\n\n3回目\n",
);
    await writeFile(
  join(baseDir, "logs", "2026-03-20.md"),
  "# 2026-03-20\n\n古い記録\n",
);
    const result = await getLogStats(baseDir);
 expect(result).toEqual({
  totalFiles: 2,
  totalEntries: 4,
  averageEntriesPerLogDay: 2,
  maxEntriesPerDay: 3,
  mostActiveDay: "2026-03-26",
  latestLog: "2026-03-26",
  oldestLog: "2026-03-20",
  daysSinceLastLog: 149,
  currentStreak: 1,
  longestStreak: 1,
  logDaysThisMonth: 0,
  logDaysLastMonth: 0,
  logDaysChange: 0,
  logRateThisMonth: 0,
  logRateLastMonth: 0,
  logRateChange: 0,
  logRateChangeText: "0.0",
  monthlyTrend: "steady",
  logDaysChangeText: "0",
});
vi.useRealTimers();
});
it("formats positive monthly log day change with plus sign", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));

 const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-positive-change-"));
 const logsDir = join(baseDir, "logs");
 await mkdir(logsDir);
 await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
 await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
 await writeFile(join(logsDir, "2026-08-02.md"), "# 2026-08-02\n");
 const result = await getLogStats(baseDir);

 expect(result.logDaysChangeText).toBe("+1");
 vi.useRealTimers();

});
it("reports improving monthly trend", async () => {

  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));


const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-improving-trend-"));
const logsDir = join(baseDir, "logs");

await mkdir(logsDir);
await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
await writeFile(join(logsDir, "2026-08-02.md"), "# 2026-08-02\n");

const result = await getLogStats(baseDir);

expect(result.monthlyTrend).toBe("improving");

vi.useRealTimers();
});
it("reports declining monthly trend", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));

const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-declining-trend-"));
const logsDir = join(baseDir, "logs");

await mkdir(logsDir);
await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
await writeFile(join(logsDir, "2026-07-02.md"), "# 2026-07-02\n");
await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
const result = await getLogStats(baseDir);

expect(result.monthlyTrend).toBe("declining");

vi.useRealTimers();
});

it("reports steady monthly trend", async () => {
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));

const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-steady-trend-"));
const logsDir = join(baseDir, "logs");

await mkdir(logsDir);

const result = await getLogStats(baseDir);
expect(result.monthlyTrend).toBe("steady");
vi.useRealTimers();
});


it("formats negative monthly log day change", async () => {
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));
const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-negative-change-"));
const logsDir = join(baseDir, "logs");

await mkdir(logsDir);
await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
await writeFile(join(logsDir, "2026-07-02.md"), "# 2026-07-02\n");
await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
const result = await getLogStats(baseDir);

expect(result.logDaysChangeText).toBe("-1");

vi.useRealTimers();
});
it("calculates the monthly log rate", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-24T00:00:00+09:00"));

  const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-log-rate-"));
  const logsDir = join(baseDir, "logs");

  await mkdir(logsDir);

  await writeFile(
    join(logsDir, "2026-08-01.md"),
    "# 2026-08-01\n",
  );

  const result = await getLogStats(baseDir);
  expect(result.logRateThisMonth).toBeCloseTo(4.1667, 3);
  vi.useRealTimers();

});

it("counts consecutive log days from the latest log", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-streak-"));
  const logsDir = join(baseDir, "logs");

  await mkdir(logsDir);

  await writeFile(join(logsDir, "2026-03-24.md"), "# 2026-03-24\n");
  await writeFile(join(logsDir, "2026-03-25.md"), "# 2026-03-25\n");
  await writeFile(join(logsDir, "2026-03-26.md"), "# 2026-03-26\n");

  const result = await getLogStats(baseDir);

  expect(result.currentStreak).toBe(3);
});
it("tracks the longest streak", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-longest-streak-"));
  const logsDir = join(baseDir, "logs");
  await mkdir(logsDir);
  await writeFile(join(logsDir, "2026-03-20.md"), "# 2026-03-20\n");
  await writeFile(join(logsDir, "2026-03-21.md"), "# 2026-03-21\n");
  await writeFile(join(logsDir, "2026-03-22.md"), "# 2026-03-22\n");
  await writeFile(join(logsDir, "2026-03-25.md"), "# 2026-03-25\n");
  const result = await getLogStats(baseDir);
  expect(result.longestStreak).toBe(3);
  expect(result.currentStreak).toBe(1);
});

});
describe("renderMonthlySummary", () => {

  it("renders logs in the supplied order", () => {
    expect(
      renderMonthlySummary("2026-07", [
        { date: "2026-07-01", content: "# 2026-07-01\n\nFirst\n" },
        { date: "2026-07-03", content: "# 2026-07-03\n\nThird\n" },
      ]),
    ).toBe(
      "# Monthly Summary: 2026-07\n\n## 2026-07-01\n\n# 2026-07-01\n\nFirst\n\n## 2026-07-03\n\n# 2026-07-03\n\nThird\n",
    );
  });

  it("renders the required empty-month message", () => {
    expect(renderMonthlySummary("2026-08", [])).toBe(
      "# Monthly Summary: 2026-08\n\n対象月のログはありません。\n",


    );

  });
});

describe("renderWeeklySummary", () => {
  it("renders logs in ascending date order supplied by the caller", () => {
    expect(
      renderWeeklySummary("2026-W13", [
        { date: "2026-03-23", content: "# 2026-03-23\n\nMonday\n" },
        { date: "2026-03-25", content: "# 2026-03-25\n\nWednesday\n" },
      ]),
    ).toBe(
      "# Weekly Summary: 2026-W13\n\n## 2026-03-23\n\n# 2026-03-23\n\nMonday\n\n## 2026-03-25\n\n# 2026-03-25\n\nWednesday\n",
    );
  });

  it("renders the required empty-week message", () => {
    expect(renderWeeklySummary("2026-W14", [])).toBe(
      "# Weekly Summary: 2026-W14\n\n対象週のログはありません。\n",
    );
  });
});

describe("formatMonthlyTrendSummary", () => {
  it("formats improving trend", () => {
    expect(formatMonthlyTrendSummary("improving")).toBe(
      "Logging is improving this month.",
    );
  });

  it("formats declining trend", () => {
    expect(formatMonthlyTrendSummary("declining")).toBe(
      "Logging is declining this month.",
    );
  });

  it("formats steady trend", () => {
    expect(formatMonthlyTrendSummary("steady")).toBe(
      "Logging is steady this month.",
    );
  });
});

describe("formatStats", () => {
  it("renders all stats fields", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T00:00:00+09:00"));
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-format-stats-"));
    const logsDir = join(baseDir, "logs");

    await mkdir(logsDir);

    await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n");
    await writeFile(join(logsDir, "2026-08-01.md"), "# 2026-08-01\n");
    await writeFile(join(logsDir, "2026-08-02.md"), "# 2026-08-02\n");
    const stats = await getLogStats(baseDir);
    const output = formatStats(stats);
    expect(output).toContain("Log files:");
    expect(output).toContain("Log entries:");
    expect(output).toContain("Average entries per log day:");
    expect(output).toContain("Most entries in a day:");
    expect(output).toContain("Most active day:");
    expect(output).toContain("Latest log:");
    expect(output).toContain("Oldest log:");
    expect(output).toContain("Days since last log:");
    expect(output).toContain("Current streak:");
    expect(output).toContain("Longest streak:");
    expect(output).toContain("Log days this month:");
    expect(output).toContain("Log rate this month:");
    expect(output).toContain("Log days last month:");
    expect(output).toContain("Log rate last month:");
    expect(output).toContain("Log rate change:");
    expect(output).toContain("Monthly trend:");
    expect(output).toContain("Summary:");
    expect(output).toContain("Log days change:");

    vi.useRealTimers();
  });
});

describe("formatHelp", () => {
  it("shows usage, examples, and unimplemented options", () => {
    expect(formatHelp()).toContain("Usage:");
    expect(formatHelp()).toContain("--date YYYY-MM-DD");
    expect(formatHelp()).toContain("--memo TEXT");
    expect(formatHelp()).toContain("--import-mobile X");
    expect(formatHelp()).toContain("--dry-run");
    expect(formatHelp()).toContain("--safe-share INPUT");
    expect(formatHelp()).toContain("--stats");
    expect(formatHelp()).toContain("--advice");
    expect(formatHelp()).toContain("--weekly-summary [YYYY-Www]");
    expect(formatHelp()).toContain("Examples:");
    expect(formatHelp()).toContain("Re-running on the same date appends a timestamped entry");
    expect(formatHelp()).toContain("mirror-logs/: not implemented");
    expect(formatHelp()).toContain("--mirror-advice");
    expect(formatHelp()).not.toContain("Unknown option: --stats");
  });
});

describe("runCli help", () => {
  it("returns help mode when --help is passed", async () => {
    await expect(runCli(["--help"])).resolves.toEqual({
      filePath: null,
      help: true,
      stats: null,
      adviceContent: null,
      advicePreviewContent: null,
      safeShareText: null,
      mobileImportPlans: null,
      dryRun: false,
    });
  });
});

describe("writeLogFile", () => {
  it("creates the logs directory and writes the file", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    await mkdir(join(baseDir, "logs"));
    const content = renderLog("テスト", "2026-03-26");
    const filePath = await writeLogFile("2026-03-26", content, baseDir);

    await expect(readFile(filePath, "utf8")).resolves.toBe(content);
  });

  it("appends a timestamped entry without overwriting existing content", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-append-"));
    const logsDir = join(baseDir, "logs");
    const filePath = join(logsDir, "2026-03-26.md");
    const existingContent = "# 2026-03-26\n\n朝のメモ\n";

    await mkdir(logsDir, { recursive: true });
    await writeFile(filePath, existingContent, "utf8");
    await writeLogFile("2026-03-26", renderLog("夜のメモ", "2026-03-26"), baseDir);

    const nextContent = await readFile(filePath, "utf8");

    expect(nextContent.startsWith(existingContent)).toBe(true);
    expect(nextContent).toContain("\n\n## Entry ");
    expect(nextContent).toContain("JST\n\n夜のメモ\n");
    expect(nextContent).toMatch(
      /^# 2026-03-26\n\n朝のメモ\n\n## Entry \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} JST\n\n夜のメモ\n$/u,
    );
  });

  it("treats whitespace-only files as empty logs", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-empty-log-"));
    const logsDir = join(baseDir, "logs");
    const filePath = join(logsDir, "2026-03-26.md");
    const content = renderLog("最初のメモ", "2026-03-26");

    await mkdir(logsDir, { recursive: true });
    await writeFile(filePath, " \n\n\t", "utf8");
    await writeLogFile("2026-03-26", content, baseDir);

    await expect(readFile(filePath, "utf8")).resolves.toBe(content);
  });
});

describe("runCli", () => {

  it("passes three ordered logs to the injected Ollama advice provider once and returns its JSON", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-advice-provider-"));
    const logs = [
      { date: "2026-09-01", content: "# 2026-09-01\n\n散歩した。\n" },
      { date: "2026-09-02", content: "# 2026-09-02\n\n本を読んだ。\n" },
      { date: "2026-09-03", content: "# 2026-09-03\n\n早めに休んだ。\n" },
    ];
    const fixedJson = JSON.stringify({
      schemaVersion: 1,
      recordedStatements: [],
      selfEvaluations: [],
      repeatedPatterns: [],
      ruminationNotice: "",
      nextAction: "短い散歩をする。",
    } satisfies AdviceOutput);
    const provider = vi.fn<AdviceProvider>().mockResolvedValue(fixedJson);

    try {
      await mkdir(join(baseDir, "logs"));
      for (const log of [...logs].reverse()) {
        await writeFile(join(baseDir, "logs", `${log.date}.md`), log.content, "utf8");
      }

      const result = await runCli(
        ["--advice", "--advice-provider", "ollama", "--output-dir", baseDir],
        { adviceProvider: provider },
      );

      expect(provider).toHaveBeenCalledTimes(1);
      expect(provider).toHaveBeenCalledWith({
        schemaVersion: 1,
        logCount: 3,
        logs,
        questions: [
          "この3件のログの間で、何が変化しましたか？",
          "繰り返し現れている感情やパターンはありますか？",
          "次にできる小さな行動は何ですか？",
        ],
        sanitized: false,
      });
      expect(result.adviceContent).toBe(fixedJson);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it.each([false, true])("preserves source logs and transmitted formatting (sanitize: %s)", async (sanitize) => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-sanitize-"));
    const secrets = [
      "user@example.com", "sk-1234567890abcdef", "ghp_12345678901234567890",
      "github_pat_12345678901234567890", "xoxb-123456789012",
      "API_KEY=secret", "ACCESS_TOKEN=secret", "SECRET_KEY=secret",
      "Authorization: Bearer secret", "/Users/person/note", "/home/person/note",
      "/private/note", "/tmp/note", "C:\\Users\\person\\note",
    ];
    const replacements = [
      "[masked-email]", ...Array(4).fill("[masked-api-key]"),
      "API_KEY=[masked-api-key]", "ACCESS_TOKEN=[masked-api-key]", "SECRET_KEY=[masked-api-key]",
      "Authorization: Bearer [masked-api-key]", ...Array(5).fill("[masked-path]"),
    ];
    const prefix = `  \t${"長い本文".repeat(60)}末尾  \r\n\r\n\r\n`;
    const logs = ["2026-10-05", "2026-10-06", "2026-10-07"].map(date => ({
      date, content: `${prefix}${secrets.join(" \t ")}\r\n  `,
    }));
    const provider = vi.fn<AdviceProvider>().mockResolvedValue("{}");
    try {
      await mkdir(join(baseDir, "logs"));
      for (const log of [...logs].reverse()) {
        await writeFile(join(baseDir, "logs", `${log.date}.md`), log.content);
      }
      await runCli([
        "--advice", "--advice-provider", "ollama", "--output-dir", baseDir,
        ...(sanitize ? ["--sanitize-advice"] : []),
      ], { adviceProvider: provider });
      expect(provider).toHaveBeenCalledTimes(1);
      const input = provider.mock.calls[0][0];
      expect(input.sanitized).toBe(sanitize);
      expect(input.logs).toEqual(logs.map(log => ({
        ...log,
        content: sanitize ? `${prefix}${replacements.join(" \t ")}\r\n  ` : log.content,
      })));
      if (sanitize) {
        for (const secret of secrets) {
          expect(input.logs[0].content).not.toContain(secret);
        }
      }
      for (const log of logs) {
        expect(await readFile(join(baseDir, "logs", `${log.date}.md`), "utf8")).toBe(log.content);
      }
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it.each([
    [], ["--advice"], ["--advice-provider", "ollama"],
  ])("requires Ollama advice for sanitization: %j", async (...args) => {
    await expect(runCli(["--sanitize-advice", ...args])).rejects.toThrow(
      "--sanitize-advice requires --advice --advice-provider ollama",
    );
  });

  it.each([
    ["--stats"], ["--safe-share", "text"], ["--monthly-summary"],
    ["--weekly-summary"], ["--import-mobile", "inbox"], ["--dry-run"],
    ["--memo", ""], ["--date", "2026-10-05"], ["本文"], [""],
    ["本文", "--memo", "replacement"],
  ])("rejects conflicting sanitization arguments: %j", async (...args) => {
    await expect(runCli([
      ...args, "--sanitize-advice", "--advice", "--advice-provider", "ollama",
    ])).rejects.toThrow("--sanitize-advice cannot be combined with");
  });

  it.each(["--help", "-h"])("allows %s with sanitization without logs or provider", async (help) => {
    expect((await runCli(["--sanitize-advice", help])).help).toBe(true);
    expect((await runCli(["--sanitize-advice", "--dry-run", help])).help).toBe(true);
    expect((await runCli(["--sanitize-advice", "--advice-provider", "ollama", help])).help).toBe(true);
    expect(formatHelp()).toContain("--sanitize-advice");
  });

  it.each([
    [], ["--advice"], ["--advice-provider", "ollama"],
  ])("requires Ollama advice for preview: %j", async (...args) => {
    for (const ordered of [["--preview-advice", ...args], [...args, "--preview-advice"]]) {
      await expect(runCli(ordered)).rejects.toThrow(
        "--preview-advice requires --advice --advice-provider ollama",
      );
    }
  });

  it.each([
    ["--stats"], ["--safe-share", "text"], ["--monthly-summary"],
    ["--weekly-summary"], ["--import-mobile", "inbox"], ["--dry-run"],
    ["--memo", ""], ["--date", "2026-10-05"], ["本文"], [""],
    ["本文", "--memo", "replacement"], ["--memo", "replacement", "本文"],
  ])("rejects conflicting preview arguments in either order: %j", async (...args) => {
    const preview = ["--preview-advice", "--advice", "--advice-provider", "ollama"];
    for (const ordered of [[...args, ...preview], [...preview, ...args]]) {
      await expect(runCli(ordered)).rejects.toThrow(
        `--preview-advice cannot be combined with ${args[0].startsWith("--") ? args[0] : "memo arguments"}`,
      );
    }
  });

  it.each(["--help", "-h"])("allows %s with preview regardless of dependencies and conflicts", async (help) => {
    for (const args of [
      [], ["--advice-provider", "ollama"], ["--dry-run"],
      ["--stats"], ["--memo", ""], ["本文"],
      ["--sanitize-advice", "--dry-run", "--advice-provider", "ollama"],
    ]) {
      for (const ordered of [[help, ...args, "--preview-advice"], ["--preview-advice", ...args, help]]) {
        expect((await runCli(ordered)).help).toBe(true);
      }
    }
    expect(formatHelp()).toContain("--preview-advice");

  });

  it.each([false, true])("previews the exact request without communication or writes (sanitize: %s)", async (sanitize) => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-preview-"));
    const provider = vi.fn<AdviceProvider>().mockResolvedValue("{}");
    const output = {
      schemaVersion: 1, recordedStatements: [], selfEvaluations: [],
      repeatedPatterns: [], ruminationNotice: "", nextAction: "休む",
    } satisfies AdviceOutput;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify(output) },
    })));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const logsDir = join(baseDir, "logs");
      await mkdir(logsDir);
      const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
      const content = (date: string) => `# ${date}\r\n  user@example.com\t${"長文".repeat(100)}\r\n\r\n`;
      for (const date of [...dates].reverse()) {
        await writeFile(join(logsDir, `${date}.md`), content(date));
      }
      const before = await readdir(logsDir);
      const args = ["--advice", "--advice-provider", "ollama", "--output-dir", baseDir,
        ...(sanitize ? ["--sanitize-advice"] : [])];
      const result = await runCli([...args, "--preview-advice"], { adviceProvider: provider });
      expect(result.adviceContent).toBeNull();
      const request = JSON.parse(result.advicePreviewContent!);
      expect(result.advicePreviewContent).toBe(JSON.stringify(request, null, 2));
      for (const policy of PATTERN_REVIEW_POLICIES) {
        expect(request.messages[0].content).toContain(policy);
      }
      const input = JSON.parse(request.messages[1].content);
      expect(input.logs).toEqual(dates.slice(1).map(date => ({
        date, content: sanitize ? content(date).replace("user@example.com", "[masked-email]") : content(date),
      })));
      expect(input.sanitized).toBe(sanitize);
      expect(input.logCount).toBe(3);
      expect((await runCli([...args, "--preview-advice"])).advicePreviewContent)
        .toBe(result.advicePreviewContent);
      expect(provider).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();

      const cli = spawnSync(process.execPath, [
        "--import", createRequire(import.meta.url).resolve("tsx"),
        fileURLToPath(new URL("../src/index.ts", import.meta.url)), ...args, "--preview-advice",
      ], { cwd: baseDir, encoding: "utf8", timeout: 10_000 });
      expect(cli.error).toBeUndefined();
      expect(cli.status).toBe(0);
      expect(cli.stderr).toBe("");
      expect(cli.stdout).toBe(`${result.advicePreviewContent}\n`);
      expect(JSON.parse(cli.stdout)).toEqual(request);

      const normal = await runCli(args);
      expect(normal.advicePreviewContent).toBeNull();
      expect(normal.adviceContent).toBe(JSON.stringify(output));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(request);
      expect(await readdir(baseDir)).toEqual(["logs"]);
      expect(await readdir(logsDir)).toEqual(before);
      for (const date of dates) {
        expect(await readFile(join(logsDir, `${date}.md`))).toEqual(Buffer.from(content(date)));
      }
    } finally {
      vi.unstubAllGlobals();
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("preserves the no-logs error for preview without writes or communication", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-preview-empty-"));
    const provider = vi.fn<AdviceProvider>();
    try {
      await mkdir(join(baseDir, "logs"));
      await expect(runCli([
        "--advice", "--advice-provider", "ollama", "--preview-advice", "--output-dir", baseDir,
      ], { adviceProvider: provider })).rejects.toThrow("No logs found for advice");
      expect(provider).not.toHaveBeenCalled();
      expect(await readdir(join(baseDir, "logs"))).toEqual([]);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("validates --advice-provider arguments", async () => {
    await expect(
      runCli(["--advice", "--advice-provider"]),
    ).rejects.toThrow("Missing value for --advice-provider");

    await expect(
      runCli(["--advice", "--advice-provider", "remote"]),
    ).rejects.toThrow("Invalid value for --advice-provider: remote");

    await expect(
      runCli(["--advice-provider", "ollama"]),
    ).rejects.toThrow("--advice-provider requires --advice");
  });


  it("fails without creating logs when --output-dir has no value", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-output-dir-missing-"));

    try {
      const result = spawnSync(process.execPath, [
        "--import",
        createRequire(import.meta.url).resolve("tsx"),
        fileURLToPath(new URL("../src/index.ts", import.meta.url)),
        "--output-dir",
      ], { cwd: baseDir, encoding: "utf8", timeout: 10_000 });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing value for --output-dir");
      await expect(readdir(baseDir)).resolves.toEqual([]);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("writes a log file to a custom output directory", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    const result = await runCli([
      "--date",
      "2026-03-26",
      "--memo",
      "今日は",
      "--output-dir",
      baseDir,
      "少し",
      "疲れた",
    ]);

    expect(result).toEqual({
      filePath: join(baseDir, "logs", "2026-03-26.md"),
      help: false,
      stats: null,
      adviceContent: null,
      advicePreviewContent: null,
      safeShareText: null,
      mobileImportPlans: null,
      dryRun: false,
    });

    if (result.filePath === null) {
      throw new Error("Expected a file path");
    }

    await expect(readFile(result.filePath, "utf8")).resolves.toContain("今日は");
  });

  it("returns the three most recent log contents for --advice", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-advice-"));
    const logsDir = join(baseDir, "logs");

    await mkdir(logsDir);

    await writeFile(
      join(logsDir, "2026-09-01.md"),
      "# 2026-09-01\n\nold log\n",
    );

    await writeFile(
      join(logsDir, "2026-09-03.md"),
      "# 2026-09-03\n\nlatest log\n",
    );

    await writeFile(
      join(logsDir, "2026-09-05.md"),
      "# 2026-09-05\n\nthird log\n",
    );

    await writeFile(
      join(logsDir, "2026-09-07.md"),
      "# 2026-09-07\n\nlatest log\n",
    );

    const result = await runCli([
      "--advice",
      "--output-dir",
      baseDir,
    ]);

    expect(result.adviceContent).toBe(
      formatAdviceInput([
        "# 2026-09-03\n\nlatest log\n",
        "# 2026-09-05\n\nthird log\n",
        "# 2026-09-07\n\nlatest log\n",
      ]),
    );
  });

  it("formats advice from the three most recent logs in ascending date order with reflection questions once", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-advice-order-"));
    const logsDir = join(baseDir, "logs");

    await mkdir(logsDir);

    await writeFile(
      join(logsDir, "2026-09-01.md"),
      "# 2026-09-01\n\noldest log\n",
    );
    await writeFile(
      join(logsDir, "2026-09-02.md"),
      "# 2026-09-02\n\nfirst selected log\n",
    );
    await writeFile(
      join(logsDir, "2026-09-03.md"),
      "# 2026-09-03\n\nsecond selected log\n",
    );
    await writeFile(
      join(logsDir, "2026-09-04.md"),
      "# 2026-09-04\n\nthird selected log\n",
    );

    const result = await runCli([
      "--advice",
      "--output-dir",
      baseDir,
    ]);

    if (result.adviceContent === null) {
      throw new Error("Expected advice content");
    }

    expect(result.adviceContent).not.toContain("oldest log");
    expect(result.adviceContent.indexOf("first selected log")).toBeLessThan(
      result.adviceContent.indexOf("second selected log"),
    );
    expect(result.adviceContent.indexOf("second selected log")).toBeLessThan(
      result.adviceContent.indexOf("third selected log"),
    );

    const questions = [
      "- この3件のログの間で、何が変化しましたか？",
      "- 繰り返し現れている感情やパターンはありますか？",
      "- 次にできる小さな行動は何ですか？",
    ];
    const tail = result.adviceContent.slice(
      result.adviceContent.indexOf("# Reflection questions"),
    );

    for (const question of questions) {
      expect(tail.split(question).length - 1).toBe(1);
    }
    expect(tail.trim().endsWith(questions.at(-1) ?? "")).toBe(true);
  });

  it("rejects --advice when no logs exist", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-advice-empty-"));
    const logsDir = join(baseDir, "logs");

    await mkdir(logsDir);

    await expect(
      runCli(["--advice", "--output-dir", baseDir]),
    ).rejects.toThrow("No logs found for advice");
  });

  it("uses only --memo when it is specified", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-"));
    const result = await runCli([
      "--memo",
      "専用メモ",
      "ignored",
      "--date",
      "2026-03-26",
      "--output-dir",
      baseDir,
    ]);

    expect(result.filePath).not.toBeNull();
    expect(result.filePath !== null && isAbsolute(result.filePath)).toBe(true);

    if (result.filePath === null) {
      throw new Error("Expected a file path");
    }

    await expect(readFile(result.filePath, "utf8")).resolves.toContain("専用メモ");
    await expect(readFile(result.filePath, "utf8")).resolves.not.toContain("ignored");
  });

  it("appends new entries to an existing --date log", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-cli-append-"));
    const args = ["--date", "2026-03-26", "--output-dir", baseDir];

    await runCli([...args, "朝のメモ"]);
    const result = await runCli([...args, "夜のメモ"]);

    expect(result.filePath).toBe(join(baseDir, "logs", "2026-03-26.md"));

    if (result.filePath === null) {
      throw new Error("Expected a file path");
    }

    const nextContent = await readFile(result.filePath, "utf8");

    expect(nextContent).toContain("# 2026-03-26\n\n朝のメモ\n");
    expect(nextContent).toContain("JST\n\n夜のメモ\n");
    expect(nextContent).not.toBe("# 2026-03-26\n\n夜のメモ\n");
  });

  it("rejects an invalid date", async () => {
    await expect(runCli(["--date", "2026-13-01"])).rejects.toThrow(
      "Invalid value for --date: 2026-13-01",
    );
  });

  it("creates a monthly summary in ascending date order", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-monthly-summary-"));
    const logsDir = join(baseDir, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(join(logsDir, "2026-07-03.md"), "# 2026-07-03\n\nThird\n", "utf8");
    await writeFile(join(logsDir, "2026-07-01.md"), "# 2026-07-01\n\nFirst\n", "utf8");
    await writeFile(join(logsDir, "2026-07-02.md"), "# 2026-07-02\n\nSecond\n", "utf8");
    await writeFile(join(logsDir, "2026-08-01.md"), "outside month\n", "utf8");

    const result = await runCli(["--monthly-summary", "2026-07", "--output-dir", baseDir]);
    const summaryPath = join(baseDir, "monthly-summary", "2026-07.md");

    expect(result.filePath).toBe(summaryPath);
    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Monthly Summary: 2026-07\n\n## 2026-07-01\n\n# 2026-07-01\n\nFirst\n\n## 2026-07-02\n\n# 2026-07-02\n\nSecond\n\n## 2026-07-03\n\n# 2026-07-03\n\nThird\n",
    );
    await expect(readFile(join(logsDir, "2026-07-01.md"), "utf8")).resolves.toBe(
      "# 2026-07-01\n\nFirst\n",
    );
  });

  it("overwrites an existing summary and creates an empty-month summary", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-monthly-empty-"));
    const summaryPath = await writeMonthlySummary("2026-09", baseDir);
    await writeFile(summaryPath, "old summary\n", "utf8");

    await runCli(["--monthly-summary", "2026-09", "--output-dir", baseDir]);

    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Monthly Summary: 2026-09\n\n対象月のログはありません。\n",
    );
  });

  it("uses the current JST month when no month is supplied", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-monthly-current-"));
    const currentMonth = getJstDateString().slice(0, 7);

    const result = await runCli(["--monthly-summary", "--output-dir", baseDir]);

    expect(result.filePath).toBe(join(baseDir, "monthly-summary", `${currentMonth}.md`));
  });

  it("creates and overwrites a weekly summary from daily logs", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-weekly-summary-"));
    const logsDir = join(baseDir, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(join(logsDir, "2026-03-25.md"), "# 2026-03-25\n\nWednesday\n", "utf8");
    await writeFile(join(logsDir, "2026-03-23.md"), "# 2026-03-23\n\nMonday\n", "utf8");

    const summaryPath = await writeWeeklySummary("2026-W13", baseDir);
    expect(summaryPath).toBe(join(baseDir, "weekly-summary", "2026-W13.md"));
    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Weekly Summary: 2026-W13\n\n## 2026-03-23\n\n# 2026-03-23\n\nMonday\n\n## 2026-03-25\n\n# 2026-03-25\n\nWednesday\n",
    );

    await writeFile(summaryPath, "old summary\n", "utf8");
    await writeWeeklySummary("2026-W13", baseDir);
    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Weekly Summary: 2026-W13\n\n## 2026-03-23\n\n# 2026-03-23\n\nMonday\n\n## 2026-03-25\n\n# 2026-03-25\n\nWednesday\n",
    );
  });

  it("supports the current JST week and an explicit week through the CLI", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-weekly-cli-"));
    const explicit = await runCli(["--weekly-summary", "2026-W13", "--output-dir", baseDir]);
    expect(explicit.filePath).toBe(join(baseDir, "weekly-summary", "2026-W13.md"));

    const current = await runCli(["--weekly-summary", "--output-dir", baseDir]);
    expect(current.filePath).toBe(join(baseDir, "weekly-summary", `${getJstWeekString()}.md`));
  });

  it("rejects malformed and nonexistent ISO weeks", async () => {
    await expect(runCli(["--weekly-summary", "2026-13"])).rejects.toThrow(
      "Invalid value for --weekly-summary: 2026-13",
    );
    await expect(runCli(["--weekly-summary", "2021-W53"])).rejects.toThrow(
      "Invalid value for --weekly-summary: 2021-W53",
    );
  });

  it("includes logs when the week crosses a month boundary", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-weekly-boundary-"));
    const logsDir = join(baseDir, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(join(logsDir, "2026-03-30.md"), "# 2026-03-30\n\nMarch\n", "utf8");
    await writeFile(join(logsDir, "2026-04-01.md"), "# 2026-04-01\n\nApril\n", "utf8");

    const summaryPath = await writeWeeklySummary("2026-W14", baseDir);

    await expect(readFile(summaryPath, "utf8")).resolves.toBe(
      "# Weekly Summary: 2026-W14\n\n## 2026-03-30\n\n# 2026-03-30\n\nMarch\n\n## 2026-04-01\n\n# 2026-04-01\n\nApril\n",
    );
  });

  it("prints sanitized safe-share text from a direct string", async () => {
    const result = await runCli([
      "--safe-share",
      " user@example.com  sk-1234567890abcdef1234567890 /Users/example/mental-auto/logs/2026-03-26.md   ",
    ]);

    expect(result).toEqual({
      filePath: null,
      help: false,
      stats: null,
      adviceContent: null,
      advicePreviewContent: null,
      safeShareText: "[masked-email]  [masked-api-key] [masked-path]",
      mobileImportPlans: null,
      dryRun: false,
    });
  });

  it("reads a file when --safe-share points to an existing local file", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-safe-share-"));
    const logPath = join(baseDir, "sample.md");

    await writeFile(
      logPath,
      "contact: user@example.com\npath: /Users/example/private/note.txt\n",
      "utf8",
    );

    const result = await runCli(["--safe-share", logPath]);

    expect(result).toEqual({
      filePath: null,
      help: false,
      stats: null,
      adviceContent: null,
      advicePreviewContent: null,
      safeShareText: "contact: [masked-email]\npath: [masked-path]",
      mobileImportPlans: null,
      dryRun: false,
    });
  });

  it("truncates long lines and normalizes extra blank lines in safe-share mode", async () => {
    const longLine = `note: ${"a".repeat(220)}`;
    const result = await runCli(["--safe-share", `line 1   \n\n\n${longLine}`]);

    expect(result.filePath).toBeNull();
    expect(result.help).toBe(false);
    expect(result.safeShareText).toContain("line 1");
    expect(result.safeShareText).toContain("[truncated]");
    expect(result.safeShareText).not.toContain("\n\n\n");
  });

  it("imports one mobile inbox file into an existing mobile notes section", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-import-"));
    const inboxDir = join(baseDir, "mobile-inbox");
    const sourcePath = join(inboxDir, "2026-06-25.md");

    await mkdir(inboxDir, { recursive: true });
    await mkdir(join(baseDir, "logs"), { recursive: true });
    await writeFile(
     join(baseDir, "logs", "2026-06-25.md"),
     "# 2026-06-25\n\nMorning log\n\n## Mobile notes\n\nExisting mobile note\n",
     "utf8",
);
    await writeFile(sourcePath, "- bought coffee\n- felt better\n", "utf8");

    const result = await runCli(["--import-mobile", sourcePath, "--output-dir", baseDir]);

    expect(result.filePath).toBeNull();
    expect(result.help).toBe(false);
    expect(result.safeShareText).toBeNull();
    expect(result.dryRun).toBe(false);
    expect(result.mobileImportPlans).toEqual([
      {
        sourcePath,
        targetLogPath: join(baseDir, "logs", "2026-06-25.md"),
        archivePath: join(inboxDir, "archive", "2026-06-25.md"),
        date: "2026-06-25",
      },
    ]);

    await expect(readFile(join(baseDir, "logs", "2026-06-25.md"), "utf8")).resolves.toBe(
      "# 2026-06-25\n\nMorning log\n\n## Mobile notes\n\nExisting mobile note\n\n- bought coffee\n- felt better\n",
    );
    await expect(readFile(join(inboxDir, "archive", "2026-06-25.md"), "utf8")).resolves.toBe(
      "- bought coffee\n- felt better\n",
    );
    await expect(stat(sourcePath)).rejects.toThrow();
  });

  it("creates a Mobile notes section when the target log does not have one", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-section-"));
    const inboxDir = join(baseDir, "mobile-inbox");
    const sourcePath = join(inboxDir, "2026-06-26.md");

    await mkdir(inboxDir, { recursive: true });
    await mkdir(join(baseDir, "logs"), { recursive: true });
    await writeFile(join(baseDir, "logs", "2026-06-26.md"), "# 2026-06-26\n\nDesk note\n", "utf8");
    await writeFile(sourcePath, "Phone memo\n", "utf8");

    await runCli(["--import-mobile", sourcePath, "--output-dir", baseDir]);

    await expect(readFile(join(baseDir, "logs", "2026-06-26.md"), "utf8")).resolves.toBe(
      "# 2026-06-26\n\nDesk note\n\n## Mobile notes\n\nPhone memo\n",
    );
  });

  it("reports plans only in dry-run mode", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-dry-run-"));
    const inboxDir = join(baseDir, "mobile-inbox");
    const sourcePath = join(inboxDir, "2026-06-27.md");

    await mkdir(inboxDir, { recursive: true });
    await mkdir(join(baseDir, "logs"), { recursive: true });
    await writeFile(join(baseDir, "logs", "2026-06-27.md"), "# 2026-06-27\n\nDesk note\n", "utf8");
    await writeFile(sourcePath, "Phone memo\n", "utf8");

    const result = await runCli([
      "--import-mobile",
      inboxDir,
      "--output-dir",
      baseDir,
      "--dry-run",
    ]);

    expect(result.mobileImportPlans).toEqual([
      {
        sourcePath,
        targetLogPath: join(baseDir, "logs", "2026-06-27.md"),
        archivePath: join(inboxDir, "archive", "2026-06-27.md"),
        date: "2026-06-27",
      },
    ]);
    expect(result.dryRun).toBe(true);
    await expect(readFile(join(baseDir, "logs", "2026-06-27.md"), "utf8")).resolves.toBe(
      "# 2026-06-27\n\nDesk note\n",
    );
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("Phone memo\n");
  });

  it("imports markdown files from a directory in filename order", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-dir-"));
    const inboxDir = join(baseDir, "mobile-inbox");

    await mkdir(inboxDir, { recursive: true });
    await writeFile(join(inboxDir, "2026-06-29.md"), "Second day\n", "utf8");
    await writeFile(join(inboxDir, "2026-06-28.md"), "First day\n", "utf8");
    await writeFile(join(inboxDir, "note.txt"), "ignore me\n", "utf8");

    const result = await runCli(["--import-mobile", inboxDir, "--output-dir", baseDir]);

    expect(result.mobileImportPlans?.map((plan) => plan.date)).toEqual([
      "2026-06-28",
      "2026-06-29",
    ]);
    await expect(readFile(join(baseDir, "logs", "2026-06-28.md"), "utf8")).resolves.toBe(
      "# 2026-06-28\n\n## Mobile notes\n\nFirst day\n",
    );
    await expect(readFile(join(baseDir, "logs", "2026-06-29.md"), "utf8")).resolves.toBe(
      "# 2026-06-29\n\n## Mobile notes\n\nSecond day\n",
    );

    const archived = await readdir(join(inboxDir, "archive"));
    expect(archived).toEqual(["2026-06-28.md", "2026-06-29.md"]);
  });

  it("rejects invalid mobile inbox filenames", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-mobile-invalid-"));
    const inboxDir = join(baseDir, "mobile-inbox");

    await mkdir(inboxDir, { recursive: true });
    await writeFile(join(inboxDir, "2026-6-27.md"), "bad date\n", "utf8");

    await expect(
      runCli(["--import-mobile", join(inboxDir, "2026-6-27.md"), "--output-dir", baseDir]),
    ).rejects.toThrow("Invalid mobile inbox filename (expected YYYY-MM-DD.md): 2026-6-27.md");
  });
});

describe("mobile import deduplication", () => {
  async function setup() {
    const base = await mkdtemp(join(tmpdir(), "mental-auto-dedup-"));
    const inbox = join(base, "inbox");
    await mkdir(inbox);
    const source = join(inbox, "2026-06-25.md");
    const log = join(base, "logs", "2026-06-25.md");
    const history = join(base, "logs", ".mobile-import-history.json");
    const args = ["--import-mobile", source, "--output-dir", base];
    return { base, inbox, source, log, history, args };
  }

  it("imports once, skips normalized duplicates, and preserves both archives", async () => {
    const t = await setup();
    await writeFile(t.source, "  first\r\nsecond\r\n ");
    await runCli(t.args);
    const before = await readFile(t.log, "utf8");
    const historyBefore = await readFile(t.history, "utf8");
    expect(before).toBe("# 2026-06-25\n\n## Mobile notes\n\nfirst\nsecond\n");
    await writeFile(t.source, "first\nsecond\n");
    const result = await runCli(t.args);
    expect(result.mobileImportPlans?.[0].skipped).toBe(true);
    expect(await readFile(t.log, "utf8")).toBe(before);
    expect(await readFile(t.history, "utf8")).toBe(historyBefore);
    expect(await readFile(join(t.inbox, "archive", "2026-06-25.md"), "utf8"))
      .toBe("  first\r\nsecond\r\n ");
    expect(await readFile(join(t.inbox, "archive", "2026-06-25.1.md"), "utf8"))
      .toBe("first\nsecond\n");
    await expect(stat(t.source)).rejects.toThrow();
  });

  it("preserves both directory import history entries and skips both on reimport", async () => {
    const t = await setup();
    const files = [
      { date: "2026-06-25", body: "first day\n" },
      { date: "2026-06-26", body: "second day\n" },
    ];
    const args = ["--import-mobile", t.inbox, "--output-dir", t.base];
    for (const file of files) {
      await writeFile(join(t.inbox, `${file.date}.md`), file.body);
    }
    await runCli(args);
    const history = await readFile(t.history, "utf8");
    expect(JSON.parse(history)).toEqual({
      schemaVersion: 1,
      entries: files.map(file => ({
        date: file.date,
        sha256: createHash("sha256").update(file.body.trim(), "utf8").digest("hex"),
      })),
    });
    const logs = await Promise.all(files.map(file =>
      readFile(join(t.base, "logs", `${file.date}.md`), "utf8"),
    ));
    for (const file of files) {
      await writeFile(join(t.inbox, `${file.date}.md`), file.body);
    }
    const result = await runCli(args);
    expect(result.mobileImportPlans?.map(plan => ({ date: plan.date, skipped: plan.skipped })))
      .toEqual(files.map(file => ({ date: file.date, skipped: true })));
    for (const [index, file] of files.entries()) {
      expect(await readFile(join(t.base, "logs", `${file.date}.md`), "utf8")).toBe(logs[index]);
      await expect(stat(join(t.inbox, `${file.date}.md`))).rejects.toThrow();
    }
    expect(await readFile(t.history, "utf8")).toBe(history);
  });

  it("imports different bodies on the same date and the same body on another date", async () => {
    const t = await setup();
    for (const body of ["first", "second", "first  line", "first line"]) {
      await writeFile(t.source, body);
      expect((await runCli(t.args)).mobileImportPlans?.[0].skipped).toBeUndefined();
    }
    expect(await readFile(t.log, "utf8")).toBe(
      "# 2026-06-25\n\n## Mobile notes\n\nfirst\n\nsecond\n\nfirst  line\n\nfirst line\n",
    );
    const other = join(t.inbox, "2026-06-26.md");
    await writeFile(other, "first");
    await runCli(["--import-mobile", other, "--output-dir", t.base]);
    expect(await readFile(join(t.base, "logs", "2026-06-26.md"), "utf8"))
      .toContain("\nfirst\n");
    expect(JSON.parse(await readFile(t.history, "utf8")).entries).toHaveLength(5);
  });

  it.each(["{", '{"schemaVersion":2,"entries":[]}',
    '{"schemaVersion":1,"entries":[{"date":"2026-02-30","sha256":"' + "a".repeat(64) + '"}]}',
    '{"schemaVersion":1,"entries":[{"date":"2026-06-25","sha256":"bad"}]}'])
  ("rejects corrupt history before modifying files: %s", async (corrupt) => {
    const t = await setup();
    await mkdir(join(t.base, "logs"));
    await writeFile(t.log, "original log");
    await writeFile(t.history, corrupt);
    await writeFile(t.source, "new body");
    await expect(runCli(t.args)).rejects.toThrow("Invalid mobile import history");
    expect(await readFile(t.log, "utf8")).toBe("original log");
    expect(await readFile(t.source, "utf8")).toBe("new body");
    expect(await readFile(t.history, "utf8")).toBe(corrupt);
    await expect(stat(join(t.inbox, "archive"))).rejects.toThrow();
  });

  it("dry-run previews new and duplicate imports without writes", async () => {
    const t = await setup();
    await writeFile(t.source, "body");
    const first = await runCli([...t.args, "--dry-run"]);
    expect(first.mobileImportPlans?.[0].skipped).toBeUndefined();
    await expect(stat(join(t.base, "logs"))).rejects.toThrow();
    await expect(stat(join(t.inbox, "archive"))).rejects.toThrow();
    expect(await readFile(t.source, "utf8")).toBe("body");
    await runCli(t.args);
    const log = await readFile(t.log, "utf8");
    const history = await readFile(t.history, "utf8");
    await writeFile(t.source, "body");
    expect((await runCli([...t.args, "--dry-run"])).mobileImportPlans?.[0].skipped).toBe(true);
    expect(await readFile(t.log, "utf8")).toBe(log);
    expect(await readFile(t.history, "utf8")).toBe(history);
    expect(await readdir(join(t.inbox, "archive"))).toEqual(["2026-06-25.md"]);
    expect(await readFile(t.source, "utf8")).toBe("body");
  });

  it("does not append again after an archive failure", async () => {
    const t = await setup();
    const archive = join(t.inbox, "archive");
    await writeFile(archive, "block archive directory creation");
    await writeFile(t.source, "body");
    await expect(runCli(t.args)).rejects.toThrow("Failed to archive mobile file");
    const log = await readFile(t.log, "utf8");
    expect(JSON.parse(await readFile(t.history, "utf8")).entries).toHaveLength(1);
    expect(await readFile(t.source, "utf8")).toBe("body");
    await rm(archive);
    expect((await runCli(t.args)).mobileImportPlans?.[0].skipped).toBe(true);
    expect(await readFile(t.log, "utf8")).toBe(log);
    expect(await readFile(join(archive, "2026-06-25.md"), "utf8")).toBe("body");
  });
});


describe("daily log file selection", () => {
  const ignoredNames = [
    "README.md", "notes.md", "2026-2-01.md", "2026-02-29.md",
    "2026-04-31.md", "2026-13-01.md", "2026-00-01.md", "2026-01-00.md",
    "2026-01-32.md", "2028-02-30.md", "2028-03-01.txt", "2028-03-02.MD",
    "2028-03-03.md.bak",
  ];

  it("uses only real daily log files for stats and the three ordered advice logs", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-selection-"));
    try {
      const logsDir = join(baseDir, "logs");
      await mkdir(logsDir);
      const dates = ["2028-02-29", "2026-03-01", "2024-02-29", "2026-02-28"];
      for (const date of dates) {
        await writeFile(join(logsDir, `${date}.md`), `# ${date}\n\n${date} memo\n`);
      }
      for (const name of ignoredNames) {
        await writeFile(join(logsDir, name), "ignored content\n");
      }
      await mkdir(join(logsDir, "2028-03-04.md"));
      const stats = await getLogStats(baseDir);
      expect(stats).toMatchObject({
        totalFiles: 4, totalEntries: 4,
        oldestLog: "2024-02-29", latestLog: "2028-02-29",
      });
      const result = await runCli(["--advice", "--output-dir", baseDir]);
      expect(result.adviceContent).toBe(formatAdviceInput(
        ["2026-02-28", "2026-03-01", "2028-02-29"].map(
          (date) => `# ${date}\n\n${date} memo\n`,
        ),
      ));
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("keeps empty stats and the no-logs advice error when all files are excluded", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-selection-empty-"));
    try {
      const logsDir = join(baseDir, "logs");
      await mkdir(logsDir);
      for (const name of ignoredNames) {
        await writeFile(join(logsDir, name), "ignored content\n");
      }
      expect(await getLogStats(baseDir)).toMatchObject({
        totalFiles: 0, totalEntries: 0, latestLog: null, oldestLog: null,
      });
      await expect(runCli(["--advice", "--output-dir", baseDir]))
        .rejects.toThrow("No logs found for advice");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("preserves filesystem errors when the logs directory is missing", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-selection-missing-"));
    try {
      await expect(getLogStats(baseDir)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(runCli(["--advice", "--output-dir", baseDir]))
        .rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
