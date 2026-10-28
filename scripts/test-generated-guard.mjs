import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const checker = join(root, "scripts/check-generated.mjs");

test("checks the index, rejects stale output, and preserves partial staging", () => {
  const fixture = mkdtempSync(join(tmpdir(), "mental-auto-check-test-"));
  const git = (...args) => execFileSync("git", args, { cwd: fixture });
  const source = join(fixture, "src/index.ts");
  const output = join(fixture, "dist/index.js");
  const build = () => execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], { cwd: fixture });
  const check = () => spawnSync(process.execPath, [checker], { cwd: fixture, encoding: "utf8" });
  try {
    git("init", "-q");
    mkdirSync(join(fixture, "src"));
    symlinkSync(resolve(root, "node_modules"), join(fixture, "node_modules"), "junction");
    writeFileSync(join(fixture, ".gitignore"), "node_modules/\n");
    writeFileSync(join(fixture, "tsconfig.json"), JSON.stringify({ compilerOptions: { outDir: "dist", types: [], skipLibCheck: true }, include: ["src/**/*.ts"] }));
    writeFileSync(source, "export const value = 1;\n");
    build();
    git("add", "src", "dist", "tsconfig.json", ".gitignore");
    const initial = check();
    assert.equal(initial.status, 0, initial.stderr);

    writeFileSync(source, "export const value = 2;\n");
    git("add", "src/index.ts");
    const stale = check();
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /dist\/index.js/);
    assert.match(stale.stderr, /npm run build/);

    build();
    const indexBefore = git("ls-files", "--stage").toString();
    const workBefore = readFileSync(output);
    assert.equal(check().status, 1, "unstaged rebuilt output still fails");
    assert.equal(git("ls-files", "--stage").toString(), indexBefore);
    assert.deepEqual(readFileSync(output), workBefore);

    git("add", "dist/index.js");
    writeFileSync(source, "invalid unstaged TypeScript !!!\n");
    assert.equal(check().status, 0, "unstaged source does not affect committed content");
    assert.equal(readFileSync(source, "utf8"), "invalid unstaged TypeScript !!!\n");

    git("add", "src/index.ts");
    assert.equal(check().status, 1, "staged compile errors block commit");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
