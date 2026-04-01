import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../src/rules.js";
import { scanProject } from "../src/scanner.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function createRepo(): Promise<string> {
  const repoDir = await mkdtemp(join(tmpdir(), "security-checker-staged-"));
  tempDirs.push(repoDir);

  await runGit(repoDir, ["init"]);
  await runGit(repoDir, ["config", "user.name", "Codex Tester"]);
  await runGit(repoDir, ["config", "user.email", "codex@example.com"]);
  await writeFile(
    join(repoDir, ".gitignore"),
    "node_modules/\ndist/\nlogs/\n.env\n.env.*\n.DS_Store\n*.log\n",
    "utf8",
  );

  return repoDir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("staged scanning", () => {
  it("reads staged index contents instead of the working tree", async () => {
    const repoDir = await createRepo();
    const filePath = join(repoDir, "secret.txt");

    await writeFile(filePath, "safe value\n", "utf8");
    await runGit(repoDir, ["add", ".gitignore", "secret.txt"]);
    await writeFile(filePath, "sk-abcdefghijklmnopqrstuvwxyz1234\n", "utf8");

    const report = await scanProject({
      rootPath: repoDir,
      config: {
        ...DEFAULT_CONFIG,
        requiredGitignoreEntries: [],
      },
      staged: true,
    });

    expect(
      report.findings.some((finding) => finding.ruleId === "block-openai-key"),
    ).toBe(false);
  });

  it("handles staged file paths with spaces", async () => {
    const repoDir = await createRepo();
    const folderPath = join(repoDir, "folder");
    const spacedFilePath = join(folderPath, "has space.txt");

    await mkdir(folderPath, { recursive: true });
    await writeFile(
      spacedFilePath,
      "sk-abcdefghijklmnopqrstuvwxyz1234\n",
      "utf8",
    );
    await runGit(repoDir, ["add", ".gitignore", "folder/has space.txt"]);

    const report = await scanProject({
      rootPath: repoDir,
      config: {
        ...DEFAULT_CONFIG,
        requiredGitignoreEntries: [],
      },
      staged: true,
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "BLOCK",
        filePath: "folder/has space.txt",
        ruleId: "block-openai-key",
      }),
    );
  });
});
