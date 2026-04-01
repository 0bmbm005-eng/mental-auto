import { describe, expect, it } from "vitest";

import { isAllowlisted } from "../src/utils.js";
import type { AllowlistConfig, Finding } from "../src/types.js";

function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "BLOCK",
    filePath: "src/example.ts",
    ruleId: "block-openai-key",
    message: "Potential OpenAI API key detected.",
    excerpt: 'const token = "sk-abcdefghijklmnopqrstuvwxyz1234";',
    ...overrides,
  };
}

function createAllowlist(
  overrides: Partial<AllowlistConfig> = {},
): AllowlistConfig {
  return {
    paths: [],
    pathPatternCombination: "OR",
    patterns: [],
    ...overrides,
  };
}

describe("allowlist path matching", () => {
  it("supports glob path matching", () => {
    expect(
      isAllowlisted(
        createFinding({ filePath: "test/fixtures/sample.txt" }),
        createAllowlist({
          paths: [{ pattern: "test/fixtures/*", matchType: "glob" }],
        }),
      ),
    ).toBe(true);
  });

  it("supports regex path matching", () => {
    expect(
      isAllowlisted(
        createFinding({ filePath: "src/example.ts" }),
        createAllowlist({
          paths: [{ pattern: "src/.*\\.ts$", matchType: "regex" }],
        }),
      ),
    ).toBe(true);
  });

  it("uses OR for path combinations when configured", () => {
    expect(
      isAllowlisted(
        createFinding({ filePath: "src/example.ts" }),
        createAllowlist({
          paths: [
            { pattern: "test/fixtures/*", matchType: "glob" },
            { pattern: "src/.*\\.ts$", matchType: "regex" },
          ],
          pathPatternCombination: "OR",
        }),
      ),
    ).toBe(true);
  });

  it("uses AND for path combinations when configured", () => {
    expect(
      isAllowlisted(
        createFinding({ filePath: "src/example.ts" }),
        createAllowlist({
          paths: [
            { pattern: "src/*.ts", matchType: "glob" },
            { pattern: "src/example.ts", matchType: "glob" },
          ],
          pathPatternCombination: "AND",
        }),
      ),
    ).toBe(true);

    expect(
      isAllowlisted(
        createFinding({ filePath: "src/example.ts" }),
        createAllowlist({
          paths: [
            { pattern: "src/*.ts", matchType: "glob" },
            { pattern: "test/fixtures/*", matchType: "glob" },
          ],
          pathPatternCombination: "AND",
        }),
      ),
    ).toBe(false);
  });
});

describe("allowlist pattern matching", () => {
  it("allows findings when a configured pattern matches the detected content", () => {
    expect(
      isAllowlisted(
        createFinding(),
        createAllowlist({
          patterns: ["sk-abcdefghijklmnopqrstuvwxyz1234"],
        }),
      ),
    ).toBe(true);
  });

  it("combines paths and patterns with OR", () => {
    expect(
      isAllowlisted(
        createFinding(),
        createAllowlist({
          paths: [{ pattern: "test/fixtures/*", matchType: "glob" }],
          patterns: ["sk-abcdefghijklmnopqrstuvwxyz1234"],
        }),
      ),
    ).toBe(true);
  });

  it("does not treat file-path-only pattern matches as allowlisted", () => {
    expect(
      isAllowlisted(
        createFinding({ filePath: "fixtures/secret.txt", excerpt: undefined }),
        createAllowlist({
          patterns: ["fixtures/secret.txt"],
        }),
      ),
    ).toBe(false);
  });
});
