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

interface WorkEntry
{
	id: string;
	tlg: string;
	edition: string;
	title: string;
	titleGreek: string;
}

interface WorksConfig
{
	textGroup: string;
	works: WorkEntry[];
}

const LockPath = path.join("corpus", "perseus-lock.json");
const WorksConfigPath = path.join("corpus", "plato-works.json");

function CreateSourceFileName(config: WorksConfig, work: WorkEntry): string
{
	const fileName = `${config.textGroup}.${work.tlg}.${work.edition}.xml`;
	return fileName;
}

function CreateSourceUrl(lock: PerseusLock, config: WorksConfig, work: WorkEntry): string
{
	const fileName = CreateSourceFileName(config, work);
	const sourceUrl = `https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/data/${config.textGroup}/${work.tlg}/${fileName}`;
	return sourceUrl;
}

function CreateSourceDirectory(config: WorksConfig, work: WorkEntry): string
{
	const directory = path.join("corpus", "source", "data", config.textGroup, work.tlg);
	return directory;
}

async function LoadJsonAsync<T>(filePath: string): Promise<T>
{
	const text = await fs.readFile(filePath, "utf8");
	const value = JSON.parse(text) as T;
	return value;
}

async function LoadSourceAsync(sourceUrl: string): Promise<string>
{
	const response = await fetch(sourceUrl);

	if (!response.ok)
	{
		throw new Error(`Corpus fetch failed with status ${response.status} for ${sourceUrl}.`);
	}

	const sourceText = await response.text();
	return sourceText;
}

async function FetchWorkAsync(lock: PerseusLock, config: WorksConfig, work: WorkEntry): Promise<void>
{
	const sourceUrl = CreateSourceUrl(lock, config, work);
	const sourceText = await LoadSourceAsync(sourceUrl);
	const directory = CreateSourceDirectory(config, work);
	const fileName = CreateSourceFileName(config, work);
	const targetPath = path.join(directory, fileName);
	await fs.mkdir(directory, { recursive: true });
	await fs.writeFile(targetPath, sourceText, "utf8");
	console.log(`Fetched ${work.title} to ${targetPath}.`);
}

async function FetchCorpusAsync(): Promise<void>
{
	const lock = await LoadJsonAsync<PerseusLock>(LockPath);
	const config = await LoadJsonAsync<WorksConfig>(WorksConfigPath);

	for (const work of config.works)
	{
		await FetchWorkAsync(lock, config, work);
	}

	console.log(`Fetched ${config.works.length} Plato works.`);
}

FetchCorpusAsync().catch((error: unknown) =>
{
	const message = error instanceof Error ? error.message : "Corpus fetch failed.";
	console.error(message);
	process.exitCode = 1;
});
