import { access, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type DoctorLevel = "OK" | "WARN" | "ERROR";

type DoctorCheck = {
  level: DoctorLevel;
  label: string;
  detail: string;
};

const TSCONFIG_NAME = "tsconfig.json";

function getRuntimePaths(baseDir = process.cwd()): {
  packageJsonPath: string;
  tsconfigPath: string;
  distDirPath: string;
  distIndexPath: string;
  logsDirPath: string;
  srcIndexPath: string;
} {
  return {
    packageJsonPath: resolve(baseDir, "package.json"),
    tsconfigPath: resolve(baseDir, TSCONFIG_NAME),
    distDirPath: resolve(baseDir, "dist"),
    distIndexPath: resolve(baseDir, "dist", "index.js"),
    logsDirPath: resolve(baseDir, "logs"),
    srcIndexPath: resolve(baseDir, "src", "index.ts"),
  };
}

function getNodeVersionCheck(): DoctorCheck {
  const version = process.version;
  const major = Number(version.replace(/^v/, "").split(".")[0]);

  if (Number.isNaN(major)) {
    return {
      level: "WARN",
      label: "Node.js version",
      detail: `unable to parse version: ${version}`,
    };
  }

  if (major >= 20) {
    return {
      level: "OK",
      label: "Node.js version",
      detail: `${version} (recommended: 20+)`,
    };
  }

  return {
    level: "WARN",
    label: "Node.js version",
    detail: `${version} (README recommends 20+)`,
  };
}

async function getPathExistenceCheck(
  label: string,
  targetPath: string,
  kind: "file" | "dir",
): Promise<DoctorCheck> {
  try {
    const targetStat = await stat(targetPath);
    const matchesKind = kind === "file" ? targetStat.isFile() : targetStat.isDirectory();

    if (!matchesKind) {
      return {
        level: "ERROR",
        label,
        detail: `exists but is not a ${kind}: ${targetPath}`,
      };
    }

    return {
      level: "OK",
      label,
      detail: targetPath,
    };
  } catch {
    return {
      level: "ERROR",
      label,
      detail: `missing: ${targetPath}`,
    };
  }
}

async function getBuildStatusCheck(
  distIndexPath: string,
  srcIndexPath: string,
): Promise<DoctorCheck> {
  try {
    const [distStat, srcStat] = await Promise.all([
      stat(distIndexPath),
      stat(srcIndexPath),
    ]);

    if (!distStat.isFile()) {
      return {
        level: "ERROR",
        label: "Build status",
        detail: `missing built entry: ${distIndexPath}`,
      };
    }

    if (distStat.mtimeMs < srcStat.mtimeMs) {
      return {
        level: "WARN",
        label: "Build status",
        detail: `dist/index.js is older than src/index.ts; run npm run build`,
      };
    }

    return {
      level: "OK",
      label: "Build status",
      detail: `${distIndexPath} is present`,
    };
  } catch {
    return {
      level: "ERROR",
      label: "Build status",
      detail: `missing built entry: ${distIndexPath}`,
    };
  }
}

async function getWritePermissionCheck(logsDirPath: string): Promise<DoctorCheck> {
  const probeDir = logsDirPath;
  const probeFile = join(
    probeDir,
    `.mental-auto-doctor-${process.pid}-${Date.now()}.tmp`,
  );

  try {
    await mkdir(probeDir, { recursive: true });
    await access(probeDir);
    await writeFile(probeFile, "doctor ok\n", "utf8");
    await rm(probeFile);

    return {
      level: "OK",
      label: "Write permission",
      detail: `write probe succeeded in ${probeDir}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      level: "ERROR",
      label: "Write permission",
      detail: `write probe failed in ${probeDir}: ${message}`,
    };
  }
}

export async function runDoctor(): Promise<{
  checks: DoctorCheck[];
  hasError: boolean;
}> {
  const {
    packageJsonPath,
    tsconfigPath,
    distDirPath,
    distIndexPath,
    logsDirPath,
    srcIndexPath,
  } = getRuntimePaths();

  const checks = await Promise.all([
    Promise.resolve(getNodeVersionCheck()),
    getPathExistenceCheck("package.json", packageJsonPath, "file"),
    getPathExistenceCheck("dist/", distDirPath, "dir"),
    getPathExistenceCheck("logs/", logsDirPath, "dir"),
    getPathExistenceCheck("tsconfig.json", tsconfigPath, "file"),
    getBuildStatusCheck(distIndexPath, srcIndexPath),
    getWritePermissionCheck(logsDirPath),
  ]);

  return {
    checks,
    hasError: checks.some((check) => check.level === "ERROR"),
  };
}

export function formatDoctorReport(checks: DoctorCheck[]): string {
  const lines = ["mental-auto doctor", ""];

  for (const check of checks) {
    lines.push(`[${check.level}] ${check.label}: ${check.detail}`);
  }

  return `${lines.join("\n")}\n`;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void runDoctor()
    .then(({ checks, hasError }) => {
      process.stdout.write(formatDoctorReport(checks));
      if (hasError) {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`mental-auto doctor failed: ${message}`);
      process.exitCode = 1;
    });
}
