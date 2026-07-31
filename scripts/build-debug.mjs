import { execFileSync } from "node:child_process";
import path from "node:path";

const nodeExecutable = process.execPath;
const typescriptExecutable = path.join("node_modules", "typescript", "bin", "tsc");

execFileSync(nodeExecutable, [
	typescriptExecutable,
	"-p",
	"tsconfig.main.json"
], {
	stdio: "inherit"
});

await import("./build-preload.mjs");
await import("./build-renderer.mjs");
