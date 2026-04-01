import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../src/rules.js";
import { scanProject } from "../src/scanner.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("scanProject", () => {
  it("reports UTF-8 decode errors as REVIEW findings", async () => {
    const rootPath = await createTempDir("security-checker-utf8-");

    await writeFile(
      join(rootPath, "invalid.txt"),
      Buffer.from([0x80, 0x81, 0x0a]),
    );

    const report = await scanProject({
      rootPath,
      config: {
        ...DEFAULT_CONFIG,
        requiredGitignoreEntries: [],
      },
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "REVIEW",
        filePath: "invalid.txt",
        ruleId: "review-read-error",
      }),
    );
  });

  it("avoids infinite recursion on symlink cycles", async () => {
    const rootPath = await createTempDir("security-checker-symlink-");
    const nestedDirectory = join(rootPath, "nested");

    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(join(rootPath, "README.md"), "hello\n", "utf8");
    await symlink(
      rootPath,
      join(nestedDirectory, "loop"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const report = await scanProject({
      rootPath,
      config: {
        ...DEFAULT_CONFIG,
        requiredGitignoreEntries: [],
      },
    });

    expect(report.summary.scannedFiles).toBeGreaterThanOrEqual(1);
    expect(
      report.findings.some((finding) => finding.filePath.includes("loop/loop")),
    ).toBe(false);
  });

  it("skips .gitignore checks outside Git repositories", async () => {
    const rootPath = await createTempDir("security-checker-no-git-");

    await writeFile(join(rootPath, "README.md"), "hello\n", "utf8");

    const report = await scanProject({
      rootPath,
      config: DEFAULT_CONFIG,
    });

    expect(
      report.findings.some((finding) =>
        finding.ruleId.startsWith("review-missing-gitignore"),
      ),
    ).toBe(false);
    expect(report.notes).toContain(
      "Git repository not detected. Skipped Git tracked file and .gitignore checks.",
    );
  });

  it("reports missing .gitignore entries inside Git repositories", async () => {
    const rootPath = await createTempDir("security-checker-gitignore-");

    await runGit(rootPath, ["init"]);
    await writeFile(join(rootPath, ".gitignore"), "node_modules/\n", "utf8");

    const report = await scanProject({
      rootPath,
      config: {
        ...DEFAULT_CONFIG,
        requiredGitignoreEntries: [".env"],
      },
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "REVIEW",
        filePath: ".gitignore",
        ruleId: "review-missing-gitignore-entry",
        message: "Recommended .gitignore entry is missing: .env",
      }),
    );
  });
});
