import { readFileSync } from "node:fs";
import path from "node:path";

// Loads local development configuration without overriding values supplied by the operating system.
export class EnvironmentFile
{
	// Name of the local development configuration file.
	private static readonly FileName = ".env.local";

	// Loads supported key-value entries from the application's working directory.
	public static LoadFromWorkingDirectory(): void
	{
		const filePath = path.join(process.cwd(), EnvironmentFile.FileName);
		let content = "";

		try
		{
			content = readFileSync(filePath, "utf8");
		}
		catch
		{
			content = "";
		}

		const lines = content.split(/\r?\n/u);

		for (const line of lines)
		{
			EnvironmentFile.LoadLine(line);
		}
	}

	// Parses and applies one environment entry when its process value is not already set.
	private static LoadLine(line: string): void
	{
		const trimmedLine = line.trim();
		const isComment = trimmedLine.startsWith("#");
		const separatorIndex = trimmedLine.indexOf("=");
		const hasEntry = !isComment && separatorIndex > 0;

		if (hasEntry)
		{
			const key = trimmedLine.slice(0, separatorIndex).trim();
			const value = trimmedLine.slice(separatorIndex + 1).trim();
			const hasKey = /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key);
			const currentValue = process.env[key];
			const hasProcessValue = currentValue !== undefined && currentValue.length > 0;

			if (hasKey && !hasProcessValue)
			{
				process.env[key] = EnvironmentFile.Unquote(value);
			}
		}
	}

	// Removes one matching pair of surrounding quotes from a configured value.
	private static Unquote(value: string): string
	{
		const isDoubleQuoted = value.startsWith("\"") && value.endsWith("\"");
		const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
		const isQuoted = (isDoubleQuoted || isSingleQuoted) && value.length >= 2;
		let result = value;

		if (isQuoted)
		{
			result = value.slice(1, -1);
		}

		return result;
	}
}