import { describe, expect, it, vi } from "vitest";
import { createOllamaAdviceProvider, runCli } from "../src/index.js";

describe("experimental repeatedPatterns", () => {
  it("requires Ollama advice and rejects preview", async () => {
    await expect(runCli(["--experimental-repeated-patterns"])).rejects.toThrow("requires --advice --advice-provider ollama");
    await expect(runCli(["--advice", "--advice-provider", "ollama", "--experimental-repeated-patterns", "--preview-advice"])).rejects.toThrow("cannot be combined with --preview-advice");
  });

  it("keeps the normal provider on a single request and preserves its response", async () => {
    const input = { schemaVersion: 1, sanitized: false, logs: [], logCount: 0, questions: [] } as const;
    const content = JSON.stringify({ schemaVersion: 1, recordedStatements: [], selfEvaluations: [], repeatedPatterns: [], ruminationNotice: "", nextAction: "Keep this." });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: { content } })));
    await expect(createOllamaAdviceProvider("model", undefined, fetchImpl)({ ...input, logs: [], questions: [] })).resolves.toBe(content);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
