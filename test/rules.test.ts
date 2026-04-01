import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  getEnvFileSeverity,
  getPresenceFindings,
  getTrackedFileFindings,
} from "../src/rules.js";
import { applyFindingSeverityPriority } from "../src/utils.js";

describe("environment file classification", () => {
  it("treats safe env example files as SAFE", () => {
    expect(getEnvFileSeverity(".env.example")).toBe("SAFE");
    expect(getPresenceFindings(".env.example", DEFAULT_CONFIG)).toEqual([]);
  });

  it("treats review env files as REVIEW", () => {
    expect(getEnvFileSeverity(".env.local")).toBe("REVIEW");
    expect(getPresenceFindings(".env.local", DEFAULT_CONFIG)).toEqual([
      {
        severity: "REVIEW",
        filePath: ".env.local",
        ruleId: "review-env-file",
        message: "Environment file requires review: .env.local",
      },
    ]);
  });

  it("treats production-flavored env files as BLOCK", () => {
    expect(getEnvFileSeverity(".env.production.local")).toBe("BLOCK");
    expect(getPresenceFindings(".env.production.local", DEFAULT_CONFIG)).toEqual([
      {
        severity: "BLOCK",
        filePath: ".env.production.local",
        ruleId: "block-env-file",
        message:
          "Sensitive environment file detected: .env.production.local",
      },
    ]);
  });

  it("blocks tracked review env files because they are committed", () => {
    expect(getTrackedFileFindings(".env.local", DEFAULT_CONFIG)).toContainEqual({
      severity: "BLOCK",
      filePath: ".env.local",
      ruleId: "block-tracked-env-file",
      message: "Environment file is tracked by Git: .env.local",
    });
  });
});

describe("severity priority", () => {
  it("keeps only the highest severity findings per file", () => {
    expect(
      applyFindingSeverityPriority([
        {
          severity: "REVIEW",
          filePath: "src/a.ts",
          ruleId: "review-example",
          message: "review",
        },
        {
          severity: "BLOCK",
          filePath: "src/a.ts",
          ruleId: "block-example",
          message: "block",
        },
        {
          severity: "REVIEW",
          filePath: "src/b.ts",
          ruleId: "review-only",
          message: "review",
        },
      ]),
    ).toEqual([
      {
        severity: "BLOCK",
        filePath: "src/a.ts",
        ruleId: "block-example",
        message: "block",
      },
      {
        severity: "REVIEW",
        filePath: "src/b.ts",
        ruleId: "review-only",
        message: "review",
      },
    ]);
  });
});
