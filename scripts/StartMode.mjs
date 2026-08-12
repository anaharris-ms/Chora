import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const providerId = process.argv[2];
const npmCommand = process.env.npm_execpath;
const relayPort = 4319;
const environment = {
	...process.env,
	MODEL_PROVIDER: providerId
};
let child;

if (npmCommand === undefined)
{
	throw new Error("The npm executable path is unavailable.");
}

if (providerId === "copilot-relay")
{
	await StartCopilotRelayAsync();
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

async function StartCopilotRelayAsync()
{
	const secret = await ReadEnvironmentValueAsync("COPILOT_RELAY_SHARED_SECRET");

	if (secret.length === 0)
	{
		throw new Error("COPILOT_RELAY_SHARED_SECRET must be configured in .env.local before starting Chora in Relay mode.");
	}

	if (await IsRelayReadyAsync(secret))
	{
		return;
	}

	const executable = GetVSCodeExecutable();
	const extensionPath = path.join(process.cwd(), "tools", "copilot-relay");
	const host = spawn(executable, [`--extensionDevelopmentPath=${extensionPath}`], {
		detached: true,
		stdio: "ignore"
	});
	host.unref();

	const isReady = await WaitForRelayAsync(secret);

	if (!isReady)
	{
		throw new Error("Chora Copilot Relay did not become ready. Check the Extension Development Host and choraCopilotRelay.sharedSecret.");
	}
}

function GetVSCodeExecutable()
{
	const configuredExecutable = process.env.VSCODE_EXECUTABLE_PATH;

	if (configuredExecutable !== undefined && existsSync(configuredExecutable))
	{
		return configuredExecutable;
	}

	const localAppData = process.env.LOCALAPPDATA ?? "";
	const defaultExecutable = path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe");

	if (!existsSync(defaultExecutable))
	{
		throw new Error("VS Code executable was not found. Set VSCODE_EXECUTABLE_PATH to start Chora's Copilot Relay.");
	}

	return defaultExecutable;
}

async function ReadEnvironmentValueAsync(key)
{
	const filePath = path.join(process.cwd(), ".env.local");
	const content = await readFile(filePath, "utf8");
	const lines = content.split(/\r?\n/u);
	const prefix = `${key}=`;
	const line = lines.find((candidate) => candidate.startsWith(prefix));
	const value = line === undefined ? "" : line.slice(prefix.length).trim();

	return value.replace(/^['"]|['"]$/gu, "");
}

async function IsRelayReadyAsync(secret)
{
	try
	{
		const response = await fetch(`http://127.0.0.1:${relayPort}/health`, {
			headers: {
				"x-copilot-relay-secret": secret
			}
		});

		return response.ok;
	}
	catch
	{
		return false;
	}
}

async function WaitForRelayAsync(secret)
{
	const attempts = 40;

	for (let attempt = 0; attempt < attempts; attempt += 1)
	{
		if (await IsRelayReadyAsync(secret))
		{
			return true;
		}

		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	return false;
}
