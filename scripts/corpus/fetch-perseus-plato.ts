import fs from "node:fs/promises";
import path from "node:path";

interface PerseusLock
{
	repository: string;
	commit: string;
	text_group: string;
	retrieved_at: string;
	license: string;
}

const LockPath = path.join("corpus", "perseus-lock.json");
const SourceFileName = "tlg0059.tlg030.perseus-grc2.xml";
const SourceDirectory = path.join("corpus", "source", "data", "tlg0059", "tlg030");

function CreateSourceUrl(lock: PerseusLock): string
{
	const sourceUrl = `https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/data/tlg0059/tlg030/${SourceFileName}`;
	return sourceUrl;
}

async function LoadLockAsync(): Promise<PerseusLock>
{
	const lockText = await fs.readFile(LockPath, "utf8");
	const lock = JSON.parse(lockText) as PerseusLock;
	return lock;
}

async function LoadSourceAsync(sourceUrl: string): Promise<string>
{
	const response = await fetch(sourceUrl);

	if (!response.ok)
	{
		throw new Error(`Corpus fetch failed with status ${response.status}.`);
	}

	const sourceText = await response.text();
	return sourceText;
}

async function FetchCorpusAsync(): Promise<void>
{
	const lock = await LoadLockAsync();
	const sourceUrl = CreateSourceUrl(lock);
	const sourceText = await LoadSourceAsync(sourceUrl);
	const targetPath = path.join(SourceDirectory, SourceFileName);
	await fs.mkdir(SourceDirectory, { recursive: true });
	await fs.writeFile(targetPath, sourceText, "utf8");
	console.log(`Corpus source written to ${targetPath}.`);
}

FetchCorpusAsync().catch((error: unknown) =>
{
	const message = error instanceof Error ? error.message : "Corpus fetch failed.";
	console.error(message);
	process.exitCode = 1;
});
