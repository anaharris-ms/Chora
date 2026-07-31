import fs from "node:fs";
import { ResolveResourcePath } from "./resource-paths.js";

function ParseEnvLine(line: string): [string, string] | null
{
	const trimmedLine = line.trim();
	const isComment = trimmedLine.startsWith("#");
	const hasEquals = trimmedLine.includes("=");
	let result: [string, string] | null = null;

	if (trimmedLine.length > 0 && !isComment && hasEquals)
	{
		const splitIndex = trimmedLine.indexOf("=");
		const key = trimmedLine.slice(0, splitIndex).trim();
		const value = trimmedLine.slice(splitIndex + 1).trim();
		result = [key, value];
	}

	return result;
}

export function LoadEnvironmentFiles(): void
{
	const candidates = [
		ResolveResourcePath(".env"),
		ResolveResourcePath(".env.local")
	];

	for (const candidatePath of candidates)
	{
		if (fs.existsSync(candidatePath))
		{
			const fileContents = fs.readFileSync(candidatePath, "utf8");
			const lines = fileContents.split(/\r?\n/);

			for (const line of lines)
			{
				const entry = ParseEnvLine(line);

				if (entry)
				{
					const [key, value] = entry;

					if (process.env[key] === undefined)
					{
						process.env[key] = value;
					}
				}
			}
		}
	}
}
