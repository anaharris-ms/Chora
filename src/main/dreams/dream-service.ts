import type { Dream } from "../../shared/dreams/dream-types.js";
import { DreamRepository } from "./dream-repository.js";

export class DreamService
{
	public constructor(private readonly repository: DreamRepository)
	{
	}

	public ListAsync(): Promise<Dream[]>
	{
		return this.repository.List();
	}

	public SaveAsync(dream: Dream): Promise<Dream>
	{
		return this.repository.Save(dream);
	}

	public DeleteAsync(dreamId: string): Promise<void>
	{
		return this.repository.Delete(dreamId);
	}
}
