import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryManifest, LibraryText, LibraryTextSummary } from "../../src/shared/library/library-types.js";
import { ParseTeiWork } from "./tei-parser";

interface PerseusLock
{
	repository: string;
	commit: string;
	text_group: string;
	retrieved_at: string;
	license: string;
}

interface CorpusReport
{
	repository: string;
	commit: string;
	text_group: string;
	importedWorks: string[];
	omittedWorks: string[];
	notes: string[];
}

const SourceFileName = "tlg0059.tlg030.perseus-grc2.xml";
const SourcePath = path.join("corpus", "source", "data", "tlg0059", "tlg030", SourceFileName);
const ManifestPath = path.join("corpus", "generated", "manifest.json");
const WorkPath = path.join("corpus", "generated", "works", "republic.json");
const ReportPath = path.join("corpus", "generated", "reports", "corpus-build-report.json");
const ChecksumPath = path.join("corpus", "checksums.json");

function CreateWork(parsedWork: ReturnType<typeof ParseTeiWork>, lock: PerseusLock): LibraryText
{
	const work: LibraryText = {
		id: "republic",
		urn: "urn:cts:greekLit:tlg0059.tlg030.perseus-grc2",
		title: "Republic",
		titleGreek: "Πολιτεία",
		author: "Plato",
		language: parsedWork.language,
		edition: {
			editor: "John Burnet",
			title: "Platonis Opera",
			volume: "4",
			publisher: "Oxford University Press",
			publicationPlace: "Oxford",
			publicationDate: "1905"
		},
		provenance: {
			sourceKind: "bundled",
			repository: lock.repository,
			commit: lock.commit,
			sourceFile: SourceFileName,
			license: lock.license
		},
		segments: parsedWork.segments
	};
	return work;
}

function CreateSummary(work: LibraryText): LibraryTextSummary
{
	const summary: LibraryTextSummary = {
		id: work.id,
		urn: work.urn,
		title: work.title,
		titleGreek: work.titleGreek,
		author: work.author,
		language: work.language,
		editor: work.edition.editor,
		fileName: "republic.json"
	};
	return summary;
}

function CreateManifest(work: LibraryText, lock: PerseusLock): LibraryManifest
{
	const summary = CreateSummary(work);
	const manifest: LibraryManifest = {
		id: "plato",
		title: "Plato Corpus",
		author: work.author,
		language: work.language,
		sourceRepository: lock.repository,
		sourceCommit: lock.commit,
		license: lock.license,
		works: [summary]
	};
	return manifest;
}

function CreateReport(lock: PerseusLock): CorpusReport
{
	const report: CorpusReport = {
		repository: lock.repository,
		commit: lock.commit,
		text_group: lock.text_group,
		importedWorks: ["republic"],
		omittedWorks: [],
		notes: ["Imported from the pinned Perseus XML source."]
	};
	return report;
}

async function LoadJsonAsync<T>(filePath: string): Promise<T>
{
	const jsonText = await fs.readFile(filePath, "utf8");
	const value = JSON.parse(jsonText) as T;
	return value;
}

async function WriteJsonAsync(filePath: string, value: unknown): Promise<void>
{
	const jsonText = JSON.stringify(value, null, "\t");
	const outputText = `${jsonText}\n`;
	const directoryPath = path.dirname(filePath);
	await fs.mkdir(directoryPath, { recursive: true });
	await fs.writeFile(filePath, outputText, "utf8");
}

async function HashFileAsync(filePath: string): Promise<string>
{
	const contents = await fs.readFile(filePath);
	const hash = crypto.createHash("sha256");
	hash.update(contents);
	const digest = hash.digest("hex");
	return digest;
}

async function WriteChecksumsAsync(): Promise<void>
{
	const generatedFiles = [ManifestPath, WorkPath, ReportPath];
	const checksums: Record<string, string> = {};

	for (const filePath of generatedFiles)
	{
		const hash = await HashFileAsync(filePath);
		const checksumKey = filePath.replaceAll("\\", "/");
		checksums[checksumKey] = hash;
	}

	await WriteJsonAsync(ChecksumPath, checksums);
}

async function BuildCorpusAsync(): Promise<void>
{
	const lock = await LoadJsonAsync<PerseusLock>(path.join("corpus", "perseus-lock.json"));
	const sourceText = await fs.readFile(SourcePath, "utf8");
	const parsedWork = ParseTeiWork(sourceText, SourceFileName);
	const work = CreateWork(parsedWork, lock);
	const manifest = CreateManifest(work, lock);
	const report = CreateReport(lock);
	await WriteJsonAsync(ManifestPath, manifest);
	await WriteJsonAsync(WorkPath, work);
	await WriteJsonAsync(ReportPath, report);
	await WriteChecksumsAsync();
	console.log(`Generated ${work.segments.length} Republic segments.`);
}

BuildCorpusAsync().catch((error: unknown) =>
{
	const message = error instanceof Error ? error.message : "Corpus build failed.";
	console.error(message);
	process.exitCode = 1;
});
