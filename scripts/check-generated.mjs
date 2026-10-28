import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

// Build the index, not the working tree: partial staging must be checked too.
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (args) => execFileSync("git", args, { cwd: root });
const snapshot = mkdtempSync(join(tmpdir(), "mental-auto-generated-"));

try {
  git(["checkout-index", "--all", `--prefix=${snapshot}${sep}`]);
  rmSync(join(snapshot, "dist"), { recursive: true, force: true });
  symlinkSync(join(root, "node_modules"), join(snapshot, "node_modules"), "junction");
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], {
    cwd: snapshot,
    stdio: "inherit",
  });
  // dist/ also contains ignored build outputs; only tracked files are committed.
  const files = git(["ls-files", "-z", "--", "dist/"]).toString().split("\0").filter(Boolean);
  if (files.length === 0) throw new Error("No staged generated files found in dist/");
  const stale = files.filter((file) => !git(["show", `:${file}`]).equals(readFileSync(join(snapshot, file))));
  if (stale.length > 0) {
    console.error(`Generated files do not match staged sources:\n${stale.join("\n")}`);
    console.error("Run npm run build, review the diff, then git add the generated files and matching sources.");
    process.exitCode = 1;
  } else {
    console.log("Staged generated files are up to date.");
  }
} catch (error) {
  console.error("Generated-file check failed. Install dependencies with npm ci and check staged sources.");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}
