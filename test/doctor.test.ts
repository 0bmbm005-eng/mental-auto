import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatDoctorReport, runDoctor } from "../src/doctor.js";

describe("formatDoctorReport", () => {
  it("renders OK/WARN/ERROR lines", () => {
    const report = formatDoctorReport([
      { level: "OK", label: "package.json", detail: "/tmp/package.json" },
      { level: "WARN", label: "Build status", detail: "run npm run build" },
      { level: "ERROR", label: "logs/", detail: "missing" },
    ]);

    expect(report).toContain("mental-auto doctor");
    expect(report).toContain("[OK] package.json: /tmp/package.json");
    expect(report).toContain("[WARN] Build status: run npm run build");
    expect(report).toContain("[ERROR] logs/: missing");
  });
});

describe("runDoctor", () => {
  it("reports OK when the local runtime basics are present", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-doctor-ok-"));

    await mkdir(join(baseDir, "src"), { recursive: true });
    await mkdir(join(baseDir, "dist"), { recursive: true });
    await mkdir(join(baseDir, "logs"), { recursive: true });
    await writeFile(join(baseDir, "package.json"), '{ "name": "mental-auto" }\n', "utf8");
    await writeFile(join(baseDir, "tsconfig.json"), "{ }\n", "utf8");
    await writeFile(join(baseDir, "src", "index.ts"), "export const source = true;\n", "utf8");
    await writeFile(join(baseDir, "dist", "index.js"), "export const built = true;\n", "utf8");

    const previousCwd = process.cwd();
    process.chdir(baseDir);

    try {
      const result = await runDoctor();

      expect(result.hasError).toBe(false);
      expect(result.checks.some((check) => check.level === "OK")).toBe(true);
      expect(result.checks.find((check) => check.label === "Write permission")?.level).toBe("OK");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("reports missing files and directories as errors", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "mental-auto-doctor-missing-"));

    const previousCwd = process.cwd();
    process.chdir(baseDir);

    try {
      const result = await runDoctor();

      expect(result.hasError).toBe(true);
      expect(result.checks.find((check) => check.label === "package.json")?.level).toBe("ERROR");
      expect(result.checks.find((check) => check.label === "dist/")?.level).toBe("ERROR");
      expect(result.checks.find((check) => check.label === "logs/")?.level).toBe("ERROR");
      expect(result.checks.find((check) => check.label === "tsconfig.json")?.level).toBe("ERROR");
      expect(result.checks.find((check) => check.label === "Build status")?.level).toBe("ERROR");
    } finally {
      process.chdir(previousCwd);
    }
  });
});
