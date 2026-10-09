import type { DeleteIdeaCommand, IdeaDiscoveryRequest, IdeaDiscoverySuggestion, IdeaRecord, SaveIdeaCommand } from "../../shared/ideas/IdeaTypes.js";

// Provides the stateless typed IPC client used by Idea workflows.
export class IdeaGateway
{
	// Lists durable Ideas belonging to one work.
	public ListAsync(workId: string): Promise<IdeaRecord[]>
	{
		const ideas = window.chora.ListIdeas(workId);

		return ideas;
	}

	// Discovers related existing Signals without persisting model output.
	public DiscoverAsync(request: IdeaDiscoveryRequest): Promise<IdeaDiscoverySuggestion[]>
	{
		const suggestions = window.chora.DiscoverIdeaSignals(request);

		return suggestions;
	}

	// Creates or updates an Idea from reader-editable draft data.
	public SaveAsync(command: SaveIdeaCommand): Promise<IdeaRecord>
	{
		const saved = window.chora.SaveIdea(command);

		return saved;
	}

	// Deletes one work-owned Idea.
	public DeleteAsync(command: DeleteIdeaCommand): Promise<void>
	{
		const deletion = window.chora.DeleteIdea(command);

		return deletion;
	}
}
