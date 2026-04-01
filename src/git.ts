import { execFile, spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import type { Readable } from "node:stream";
import { promisify } from "node:util";

import { normalizePath } from "./utils.js";

const execFileAsync = promisify(execFile);
const GIT_COMMAND_MAX_BUFFER = 64 * 1024 * 1024;

interface StagedFileStream {
  stream: Readable;
  completed: Promise<void>;
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function runGitBuffer(args: string[], cwd: string): Promise<Buffer> {
  const result = await execFileAsync("git", args, {
    cwd,
    encoding: "buffer",
    maxBuffer: GIT_COMMAND_MAX_BUFFER,
  });

  return result.stdout as Buffer;
}

function parseNulSeparatedPaths(buffer: Buffer): string[] {
  if (buffer.length === 0) {
    return [];
  }

  return buffer
    .toString("utf8")
    .split("\0")
    .filter((value) => value !== "")
    .map((value) => normalizePath(value));
}

export async function getGitRoot(cwd: string): Promise<string | null> {
  try {
    const output = await runGit(["rev-parse", "--show-toplevel"], cwd);
    return output === "" ? null : await realpath(output);
  } catch {
    return null;
  }
}

export async function listTrackedFiles(cwd: string): Promise<string[]> {
  const output = await runGit(["ls-files"], cwd);

  return output === ""
    ? []
    : output.split(/\r?\n/u).map((item) => normalizePath(item));
}

export async function listStagedFiles(cwd: string): Promise<string[]> {
  const output = await runGitBuffer(
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
    cwd,
  );

  return parseNulSeparatedPaths(output);
}

export async function getStagedFileSize(
  cwd: string,
  gitRelativePath: string,
): Promise<number> {
  const output = await runGit(["cat-file", "-s", `:${gitRelativePath}`], cwd);

  return Number.parseInt(output, 10);
}

export async function getStagedBinaryDiffHint(
  cwd: string,
  gitRelativePath: string,
): Promise<boolean> {
  const output = await runGit(
    ["check-attr", "--cached", "diff", "--", gitRelativePath],
    cwd,
  );

  const match = output.match(/: diff: (.+)$/u);
  const attributeValue = match?.[1]?.trim();

  return attributeValue === "unset";
}

export function openStagedFileStream(
  cwd: string,
  gitRelativePath: string,
): StagedFileStream {
  const child = spawn("git", ["show", `:${gitRelativePath}`], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const completed = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim() === ""
            ? `git show failed for ${gitRelativePath}`
            : stderr.trim(),
        ),
      );
    });
  });

  return {
    stream: child.stdout,
    completed,
  };
}
