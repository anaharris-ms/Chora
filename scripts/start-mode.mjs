import { spawn } from "node:child_process";

const providerId = process.argv[2];
const npmCommand = process.env.npm_execpath;
const environment = {
	...process.env,
	MODEL_PROVIDER: providerId
};
let child;

if (npmCommand === undefined)
{
	throw new Error("The npm executable path is unavailable.");
}

child = spawn(process.execPath, [npmCommand, "run", "start:app"], {
	stdio: "inherit",
	env: environment
});

child.once("exit", function SetExitCode(exitCode)
{
	const code = exitCode ?? 1;

	process.exitCode = code;
});

child.once("error", function ReportError(error)
{
	console.error(error.message);
	process.exitCode = 1;
});
