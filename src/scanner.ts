import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  getGitRoot,
  getStagedBinaryDiffHint,
  getStagedFileSize,
  listStagedFiles,
  listTrackedFiles,
  openStagedFileStream,
} from "./git.js";
import { inspectGitignore } from "./gitignore-checker.js";
import { readLinesFromStream } from "./line-reader.js";
import {
  compileRules,
  getInvalidPatternSources,
  getPresenceFindings,
  getTrackedFileFindings,
  scanLine,
} from "./rules.js";
import type { Finding, ScanProjectOptions, ScanReport, ScanSummary, SecurityRulesConfig } from "./types.js";
import {
  applyFindingSeverityPriority,
  dedupeFindings,
  higherSeverity,
  isAllowlisted,
  isPathWithin,
  normalizePath,
  shouldIgnorePath,
  sortFindings,
  toRelativePath,
} from "./utils.js";

const STREAM_SCAN_CHUNK_SIZE = 64 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;

interface TrackedFileEntry {
  absolutePath: string;
  gitRelativePath: string;
  rootRelativePath: string;
}

function getInodeKey(stats: { dev: number | bigint; ino: number | bigint }): string {
  return `${stats.dev.toString()}:${stats.ino.toString()}`;
}

function isSameOrWithinRoot(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = resolve(rootPath);
  const resolvedTarget = resolve(targetPath);

  return resolvedTarget === resolvedRoot || isPathWithin(resolvedRoot, resolvedTarget);
}

function getGeneratedReportFiles(reportPrefix: string): Set<string> {
  return new Set([`${reportPrefix}.md`, `${reportPrefix}.json`]);
}

async function collectFilesRecursively(
  rootPath: string,
  currentPath: string,
  ignorePaths: string[],
  generatedReportFiles: Set<string>,
  visitedInodes: Set<string>,
): Promise<string[]> {
  let currentStats;

  try {
    currentStats = await lstat(currentPath);
  } catch {
    return [];
  }

  const currentInodeKey = getInodeKey(currentStats);

  if (visitedInodes.has(currentInodeKey)) {
    return [];
  }

  visitedInodes.add(currentInodeKey);

  let listPath = currentPath;

  if (currentStats.isSymbolicLink()) {
    let resolvedTargetPath: string;

    try {
      resolvedTargetPath = await realpath(currentPath);
    } catch {
      return [];
    }

    if (!isSameOrWithinRoot(rootPath, resolvedTargetPath)) {
      return [];
    }

    let targetStats;

    try {
      targetStats = await stat(resolvedTargetPath);
    } catch {
      return [];
    }

    if (!targetStats.isDirectory()) {
      return [];
    }

    const targetInodeKey = getInodeKey(targetStats);

    if (visitedInodes.has(targetInodeKey)) {
      return [];
    }

    visitedInodes.add(targetInodeKey);
    listPath = resolvedTargetPath;
  }

  const entries = await readdir(listPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(currentPath, entry.name);
    const relativePath = toRelativePath(rootPath, absolutePath);

    if (relativePath === "") {
      continue;
    }

    if (shouldIgnorePath(relativePath, ignorePaths)) {
      continue;
    }

    if (entry.isDirectory() || entry.isSymbolicLink()) {
      files.push(
        ...(await collectFilesRecursively(
          rootPath,
          absolutePath,
          ignorePaths,
          generatedReportFiles,
          visitedInodes,
        )),
      );
      continue;
    }

    if (entry.isFile() && !generatedReportFiles.has(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function filterAllowlisted(
  findings: Finding[],
  config: SecurityRulesConfig,
): Finding[] {
  return findings.filter((finding) => !isAllowlisted(finding, config.allowlist));
}

async function resolveTrackedFilesForRoot(
  rootPath: string,
  staged: boolean,
  notes: string[],
): Promise<{ gitRoot: string | null; trackedFiles: TrackedFileEntry[] }> {
  const gitRoot = await getGitRoot(rootPath);

  if (gitRoot === null) {
    if (staged) {
      throw new Error("The --staged option requires a Git repository.");
    }

    notes.push("Git repository not detected. Skipped Git tracked file and .gitignore checks.");
    return { gitRoot: null, trackedFiles: [] };
  }

  const trackedFiles = staged
    ? await listStagedFiles(rootPath)
    : await listTrackedFiles(rootPath);

  return {
    gitRoot,
    trackedFiles: trackedFiles
      .map((gitRelativePath) => ({
        absolutePath: resolve(gitRoot, gitRelativePath),
        gitRelativePath: normalizePath(gitRelativePath),
      }))
      .filter((file) => isPathWithin(rootPath, file.absolutePath))
      .map((file) => ({
        ...file,
        rootRelativePath: normalizePath(
          toRelativePath(rootPath, file.absolutePath),
        ),
      })),
  };
}

interface FileInspectionResult {
  relativePath?: string;
  findings: Finding[];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await worker(items[currentIndex]);
      }
    }),
  );

  return results;
}

async function inspectFile(
  absolutePath: string,
  rootPath: string,
  config: SecurityRulesConfig,
  generatedReportFiles: Set<string>,
  compiledRules: ReturnType<typeof compileRules>,
  skipLarge: boolean,
): Promise<FileInspectionResult> {
  let fileStats;

  try {
    fileStats = await stat(absolutePath);
  } catch {
    return { findings: [] };
  }

  if (!fileStats.isFile()) {
    return { findings: [] };
  }

  const relativePath = normalizePath(toRelativePath(rootPath, absolutePath));

  if (relativePath === "") {
    return { findings: [] };
  }

  const findings = filterAllowlisted(
    getPresenceFindings(relativePath, config),
    config,
  );

  if (
    shouldIgnorePath(relativePath, config.ignorePaths) ||
    generatedReportFiles.has(basename(relativePath))
  ) {
    return { relativePath, findings };
  }

  if (skipLarge && fileStats.size > config.maxFileSizeBytes) {
    return {
      relativePath,
      findings: [
        ...findings,
        {
          severity: "REVIEW",
          filePath: relativePath,
          ruleId: "review-large-file-skipped",
          message: `Skipped file larger than ${config.maxFileSizeBytes} bytes.`,
        },
      ],
    };
  }

  const lineFindings: Finding[] = [];
  const lineReaderResult = await readLinesFromStream({
    stream: createReadStream(absolutePath, {
      highWaterMark: STREAM_SCAN_CHUNK_SIZE,
    }),
    maxLineBytes: MAX_LINE_BYTES,
    forceText: basename(relativePath).startsWith(".env"),
    onLine: async (line, lineNumber) => {
      lineFindings.push(
        ...filterAllowlisted(
          scanLine(relativePath, lineNumber, line, compiledRules),
          config,
        ),
      );
    },
  });

  if (lineReaderResult.kind === "binary") {
    return { relativePath, findings };
  }

  if (lineReaderResult.kind === "decode_error") {
    findings.push({
      severity: "REVIEW",
      filePath: relativePath,
      ruleId: "review-read-error",
      message: `Failed to read file. ${lineReaderResult.decodeError ?? "Unknown error."}`,
    });
  }

  for (const oversizedLine of lineReaderResult.oversizedLines) {
    findings.push({
      severity: "REVIEW",
      filePath: relativePath,
      line: oversizedLine.lineNumber,
      ruleId: "review-line-too-large",
      message: `Skipped line larger than ${MAX_LINE_BYTES} bytes.`,
    });
  }

  return {
    relativePath,
    findings: [...findings, ...lineFindings],
  };
}

async function inspectStagedFile(
  trackedFile: TrackedFileEntry,
  gitRoot: string,
  config: SecurityRulesConfig,
  generatedReportFiles: Set<string>,
  compiledRules: ReturnType<typeof compileRules>,
  skipLarge: boolean,
): Promise<FileInspectionResult> {
  const relativePath = trackedFile.rootRelativePath;
  const findings = filterAllowlisted(getPresenceFindings(relativePath, config), config);

  if (generatedReportFiles.has(basename(relativePath))) {
    return { relativePath, findings };
  }

  try {
    if (skipLarge) {
      const stagedFileSize = await getStagedFileSize(
        gitRoot,
        trackedFile.gitRelativePath,
      );

      if (stagedFileSize > config.maxFileSizeBytes) {
        return {
          relativePath,
          findings: [
            ...findings,
            {
              severity: "REVIEW",
              filePath: relativePath,
              ruleId: "review-large-file-skipped",
              message: `Skipped file larger than ${config.maxFileSizeBytes} bytes.`,
            },
          ],
        };
      }
    }

    const forceText = basename(relativePath).startsWith(".env");
    const binaryHint = forceText
      ? false
      : await getStagedBinaryDiffHint(gitRoot, trackedFile.gitRelativePath);

    if (binaryHint) {
      return { relativePath, findings };
    }

    const stagedFileStream = openStagedFileStream(gitRoot, trackedFile.gitRelativePath);
    const lineFindings: Finding[] = [];
    const lineReaderResult = await readLinesFromStream({
      stream: stagedFileStream.stream,
      maxLineBytes: MAX_LINE_BYTES,
      forceText,
      onLine: async (line, lineNumber) => {
        lineFindings.push(
          ...filterAllowlisted(
            scanLine(relativePath, lineNumber, line, compiledRules),
            config,
          ),
        );
      },
    });

    await stagedFileStream.completed;

    if (lineReaderResult.kind === "binary") {
      return { relativePath, findings };
    }

    if (lineReaderResult.kind === "decode_error") {
      findings.push({
        severity: "REVIEW",
        filePath: relativePath,
        ruleId: "review-read-error",
        message: `Failed to read staged file. ${lineReaderResult.decodeError ?? "Unknown error."}`,
      });
    }

    for (const oversizedLine of lineReaderResult.oversizedLines) {
      findings.push({
        severity: "REVIEW",
        filePath: relativePath,
        line: oversizedLine.lineNumber,
        ruleId: "review-line-too-large",
        message: `Skipped line larger than ${MAX_LINE_BYTES} bytes.`,
      });
    }

    return {
      relativePath,
      findings: [...findings, ...lineFindings],
    };
  } catch (error) {
    return {
      relativePath,
      findings: [
        ...findings,
        {
          severity: "REVIEW",
          filePath: relativePath,
          ruleId: "review-read-error",
          message: `Failed to read staged file. ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

function summarize(consideredPaths: Set<string>, findings: Finding[]): ScanSummary {
  const severityByFile = new Map<string, Finding["severity"]>();

  for (const filePath of consideredPaths) {
    severityByFile.set(filePath, "SAFE");
  }

  for (const finding of findings) {
    severityByFile.set(
      finding.filePath,
      higherSeverity(
        severityByFile.get(finding.filePath) ?? "SAFE",
        finding.severity,
      ),
    );
  }

  let safeCount = 0;
  let reviewCount = 0;
  let blockCount = 0;

  for (const severity of severityByFile.values()) {
    if (severity === "SAFE") {
      safeCount += 1;
    } else if (severity === "REVIEW") {
      reviewCount += 1;
    } else {
      blockCount += 1;
    }
  }

  return {
    scannedFiles: consideredPaths.size,
    findingCount: findings.length,
    safeCount,
    reviewCount,
    blockCount,
  };
}

export async function scanProject(
  options: ScanProjectOptions,
): Promise<ScanReport> {
  const resolvedRootPath = resolve(options.rootPath);
  const rootPath = await realpath(resolvedRootPath).catch(() => resolvedRootPath);
  const notes: string[] = [];
  const consideredPaths = new Set<string>();
  const findings: Finding[] = [];
  const enabledRules = options.enabledRules ?? [];
  const concurrency = options.concurrency ?? 4;
  const skipLarge = options.skipLarge ?? false;
  const generatedReportFiles = getGeneratedReportFiles(options.config.reportPrefix);
  const compiledRules = compileRules(options.config, enabledRules);
  const invalidPatterns = getInvalidPatternSources(options.config, enabledRules);

  if (invalidPatterns.length > 0) {
    notes.push(`Skipped invalid configured patterns: ${invalidPatterns.join(", ")}`);
  }

  const trackedFileContext = await resolveTrackedFilesForRoot(
    rootPath,
    options.staged ?? false,
    notes,
  );
  const trackedFiles = trackedFileContext.trackedFiles;

  for (const trackedPath of trackedFiles) {
    consideredPaths.add(trackedPath.rootRelativePath);
    findings.push(
      ...filterAllowlisted(
        getTrackedFileFindings(trackedPath.rootRelativePath, options.config),
        options.config,
      ),
    );
  }

  const fileResults = options.staged
    ? await mapWithConcurrency(
        trackedFiles,
        concurrency,
        async (trackedFile) =>
          inspectStagedFile(
            trackedFile,
            trackedFileContext.gitRoot ?? rootPath,
            options.config,
            generatedReportFiles,
            compiledRules,
            skipLarge,
          ),
      )
    : await mapWithConcurrency(
        await collectFilesRecursively(
          rootPath,
          rootPath,
          options.config.ignorePaths,
          generatedReportFiles,
          new Set<string>(),
        ),
        concurrency,
        async (absolutePath) =>
          inspectFile(
            absolutePath,
            rootPath,
            options.config,
            generatedReportFiles,
            compiledRules,
            skipLarge,
          ),
      );

  for (const result of fileResults) {
    if (result.relativePath !== undefined) {
      consideredPaths.add(result.relativePath);
    }

    findings.push(...result.findings);
  }

  const gitignoreResult = await inspectGitignore(
    rootPath,
    trackedFileContext.gitRoot,
    options.config,
  );

  for (const consideredPath of gitignoreResult.consideredPaths) {
    consideredPaths.add(consideredPath);
  }

  findings.push(...gitignoreResult.findings);

  const normalizedFindings = sortFindings(
    applyFindingSeverityPriority(dedupeFindings(findings)),
  );

  return {
    rootPath,
    scannedAt: new Date().toISOString(),
    mode: options.staged ? "staged" : "all",
    summary: summarize(consideredPaths, normalizedFindings),
    findings: normalizedFindings,
    notes,
  };
}
