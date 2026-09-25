import { execFileSync } from "node:child_process";
import path from "node:path";

// Signals the Vite build scripts to skip minification, so sourcemaps stay line-accurate while debugging.
process.env.CHORA_DEBUG_BUILD = "true";

const nodeExecutable = process.execPath;
const typescriptExecutable = path.join("node_modules", "typescript", "bin", "tsc");

execFileSync(nodeExecutable, [
	typescriptExecutable,
	"-p",
	"tsconfig.main.json"
], {
	stdio: "inherit"
});

await import("./BuildPreload.mjs");
await import("./BuildRenderer.mjs");
