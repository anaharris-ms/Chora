import { randomUUID } from "node:crypto";
import type { Dream } from "../../shared/dreams/DreamTypes.js";
import type { DeleteIdeaCommand, IdeaRecord, IdeaSignalReference, SaveIdeaCommand } from "../../shared/ideas/IdeaTypes.js";
import { Idea } from "./Idea.js";
import { IdeaRepository } from "./IdeaRepository.js";

// Provides authoritative Dream records needed to resolve Idea evidence.
export interface IdeaDreamAccess
{
	// Lists the reader-owned Dreams visible to Ideas.
	ListAsync(): Promise<Dream[]>;
}

// Owns durable Ideas, canonical identities, and cross-Dream evidence validation.
export class IdeaLibrary
{
	// Aggregates keyed by main-owned Idea identity.
	private readonly ideas = new Map<string, Idea>();
	// Tracks whether persisted Ideas have been loaded for this application run.
	private isLoaded = false;

	// Creates the authoritative Idea library and its required collaborators.
	public constructor(
		private readonly repository: IdeaRepository,
		private readonly dreams: IdeaDreamAccess)
	{
	}

	// Lists immutable Idea records belonging to one work.
	public async ListAsync(workId: string): Promise<IdeaRecord[]>
	{
		await this.EnsureLoadedAsync();
		const records: IdeaRecord[] = [];

		for (const idea of this.ideas.values())
		{
			const ownsIdea = idea.GetWorkId() === workId;

			if (ownsIdea)
			{
				const record = idea.ToRecord();
				records.push(record);
			}
		}

		return records;
	}

	// Creates or updates an Idea after resolving every submitted Signal.
	public async SaveAsync(command: SaveIdeaCommand): Promise<IdeaRecord>
	{
		await this.EnsureLoadedAsync();
		const originSignal = await this.ResolveReferenceAsync(command.workId, command.originSignal);
		const relatedSignals = await this.ResolveReferencesAsync(command.workId, command.relatedSignals);
		const normalizedCommand: SaveIdeaCommand = {
			...structuredClone(command),
			originSignal,
			relatedSignals
		};
		const now = new Date();
		const timestamp = now.toISOString();
		let idea: Idea;

		if (command.ideaId === null)
		{
			const ideaId = randomUUID();
			idea = Idea.Create(normalizedCommand, ideaId, timestamp);
		}
		else
		{
			const existing = this.ideas.get(command.ideaId);

			if (existing === undefined)
			{
				throw new Error(`Idea does not exist: ${command.ideaId}`);
			}

			idea = existing.Update(normalizedCommand, timestamp);
		}

		const record = idea.ToRecord();
		await this.repository.SaveAsync(record);
		const ideaId = idea.GetId();
		this.ideas.set(ideaId, idea);

		return record;
	}

	// Deletes one Idea after proving work ownership.
	public async DeleteAsync(command: DeleteIdeaCommand): Promise<void>
	{
		await this.EnsureLoadedAsync();
		const idea = this.ideas.get(command.ideaId);

		if (idea === undefined)
		{
			throw new Error(`Idea does not exist: ${command.ideaId}`);
		}
		if (idea.GetWorkId() !== command.workId)
		{
			throw new Error("Idea does not belong to the requested work");
		}

		await this.repository.DeleteAsync(command.ideaId);
		this.ideas.delete(command.ideaId);
	}

	// Loads and validates persisted Idea aggregates once.
	private async EnsureLoadedAsync(): Promise<void>
	{
		if (!this.isLoaded)
		{
			const records = await this.repository.LoadAsync();

			for (const record of records)
			{
				const idea = new Idea(record);
				const ideaId = idea.GetId();
				const hasIdea = this.ideas.has(ideaId);

				if (!hasIdea)
				{
					this.ideas.set(ideaId, idea);
				}
			}

			this.isLoaded = true;
		}
	}

	// Resolves submitted references against authoritative same-work Dreams.
	private async ResolveReferencesAsync(workId: string, references: readonly IdeaSignalReference[]): Promise<IdeaSignalReference[]>
	{
		const dreams = await this.dreams.ListAsync();
		const resolved: IdeaSignalReference[] = [];
		const identities = new Set<string>();

		for (const reference of references)
		{
			const dreamId = reference.dreamId.trim();
			const signalId = reference.signalId.trim();
			const dream = this.FindDream(dreams, dreamId);

			if (dream === null)
			{
				throw new Error(`Idea Signal reference Dream is unresolved: ${dreamId}`);
			}
			if (dream.workId !== workId)
			{
				throw new Error(`Idea Signal reference belongs to another work: ${dreamId}`);
			}

			const hasSignal = this.HasSignal(dream, signalId);

			if (!hasSignal)
			{
				throw new Error(`Idea Signal reference is unresolved: ${signalId}`);
			}

			const identity = this.CreateReferenceIdentity(dreamId, signalId);
			const isKnown = identities.has(identity);

			if (!isKnown)
			{
				identities.add(identity);
				resolved.push({ dreamId, signalId });
			}
		}

		return resolved;
	}

	// Resolves one submitted Signal against authoritative same-work Dreams.
	private async ResolveReferenceAsync(workId: string, reference: IdeaSignalReference): Promise<IdeaSignalReference>
	{
		const references = await this.ResolveReferencesAsync(workId, [reference]);
		const resolved = references[0];

		if (resolved === undefined)
		{
			throw new Error("Idea Signal reference is unresolved");
		}

		return resolved;
	}

	// Finds one Dream by its stable identity.
	private FindDream(dreams: readonly Dream[], dreamId: string): Dream | null
	{
		let found: Dream | null = null;

		for (const dream of dreams)
		{
			if (dream.id === dreamId)
			{
				found = dream;
			}
		}

		return found;
	}

	// Determines whether one Dream owns the submitted Signal identity.
	private HasSignal(dream: Dream, signalId: string): boolean
	{
		let hasSignal = false;

		for (const signal of dream.signals)
		{
			if (signal.id === signalId)
			{
				hasSignal = true;
			}
		}

		return hasSignal;
	}

	// Creates the stable identity used to remove duplicate references.
	private CreateReferenceIdentity(dreamId: string, signalId: string): string
	{
		const identity = `signal:${dreamId}:${signalId}`;

		return identity;
	}
}
