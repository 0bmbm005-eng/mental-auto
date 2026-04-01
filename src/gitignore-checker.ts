import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { getGitignoreFindings } from "./rules.js";
import type { Finding, SecurityRulesConfig } from "./types.js";
import { isAllowlisted } from "./utils.js";

interface GitignoreCheckResult {
  consideredPaths: string[];
  findings: Finding[];
}

function filterAllowlistedGitignoreFindings(
  findings: Finding[],
  config: SecurityRulesConfig,
): Finding[] {
  return findings.filter((finding) => !isAllowlisted(finding, config.allowlist));
}

export async function inspectGitignore(
  rootPath: string,
  gitRoot: string | null,
  config: SecurityRulesConfig,
): Promise<GitignoreCheckResult> {
  if (gitRoot === null) {
    return {
      consideredPaths: [],
      findings: [],
    };
  }

  try {
    const gitignoreContent = await readFile(resolve(rootPath, ".gitignore"), "utf8");

    return {
      consideredPaths: [".gitignore"],
      findings: filterAllowlistedGitignoreFindings(
        getGitignoreFindings(gitignoreContent, config),
        config,
      ),
    };
  } catch {
    return {
      consideredPaths: [".gitignore"],
      findings: filterAllowlistedGitignoreFindings(
        getGitignoreFindings(null, config),
        config,
      ),
    };
  }
}
