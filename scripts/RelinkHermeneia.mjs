import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

// npm's file: dependency cache does not refresh on plain `npm install`; force a clean copy.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const installedPath = join(repoRoot, "node_modules", "hermeneia-core");

await rm(installedPath, { recursive: true, force: true });

const result = spawnSync("npm", ["install"], { cwd: repoRoot, stdio: "inherit", shell: true });

process.exit(result.status ?? 1);
