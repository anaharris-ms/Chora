import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/contracts/IpcChannels.js";
import type { DeleteIdeaCommand, IdeaDiscoveryRequest, IdeaDiscoverySuggestion, IdeaRecord, SaveIdeaCommand } from "../../shared/ideas/IdeaTypes.js";
import { IdeaDiscovery } from "./IdeaDiscovery.js";
import { IdeaLibrary } from "./IdeaLibrary.js";

// Owns the Electron IPC boundary for Idea commands and queries.
export class IdeaIpcController
{
	// Lists the channels registered by this controller.
	private readonly channels = [
		IPC_CHANNELS.listIdeas,
		IPC_CHANNELS.discoverIdeaSignals,
		IPC_CHANNELS.saveIdea,
		IPC_CHANNELS.deleteIdea
	] as const;
	// Handles work-scoped Idea queries.
	private readonly listHandler: (_event: IpcMainInvokeEvent, workId: string) => Promise<IdeaRecord[]>;
	// Handles model-assisted Signal discovery.
	private readonly discoverHandler: (_event: IpcMainInvokeEvent, request: IdeaDiscoveryRequest) => Promise<IdeaDiscoverySuggestion[]>;
	// Handles narrow Idea save commands.
	private readonly saveHandler: (_event: IpcMainInvokeEvent, command: SaveIdeaCommand) => Promise<IdeaRecord>;
	// Handles narrow Idea deletion commands.
	private readonly deleteHandler: (_event: IpcMainInvokeEvent, command: DeleteIdeaCommand) => Promise<void>;

	// Creates the IPC controller from the authoritative Idea library and discovery boundary.
	public constructor(
		private readonly ideas: IdeaLibrary,
		private readonly discovery: IdeaDiscovery)
	{
		this.listHandler = this.HandleListAsync.bind(this);
		this.discoverHandler = this.HandleDiscoverAsync.bind(this);
		this.saveHandler = this.HandleSaveAsync.bind(this);
		this.deleteHandler = this.HandleDeleteAsync.bind(this);
	}

	// Registers every Idea IPC handler.
	public Register(): void
	{
		ipcMain.handle(IPC_CHANNELS.listIdeas, this.listHandler);
		ipcMain.handle(IPC_CHANNELS.discoverIdeaSignals, this.discoverHandler);
		ipcMain.handle(IPC_CHANNELS.saveIdea, this.saveHandler);
		ipcMain.handle(IPC_CHANNELS.deleteIdea, this.deleteHandler);
	}

	// Removes every Idea IPC handler.
	public Unregister(): void
	{
		for (const channel of this.channels)
		{
			ipcMain.removeHandler(channel);
		}
	}

	// Lists durable Ideas belonging to one work.
	private HandleListAsync(_event: IpcMainInvokeEvent, workId: string): Promise<IdeaRecord[]>
	{
		const ideas = this.ideas.ListAsync(workId);

		return ideas;
	}

	// Runs discovery against existing Signals without persisting model output.
	private HandleDiscoverAsync(
		_event: IpcMainInvokeEvent,
		request: IdeaDiscoveryRequest): Promise<IdeaDiscoverySuggestion[]>
	{
		const suggestions = this.discovery.DiscoverAsync(request);

		return suggestions;
	}

	// Saves reader-editable Idea data through the authoritative library.
	private HandleSaveAsync(_event: IpcMainInvokeEvent, command: SaveIdeaCommand): Promise<IdeaRecord>
	{
		const saved = this.ideas.SaveAsync(command);

		return saved;
	}

	// Deletes one work-owned Idea through the authoritative library.
	private HandleDeleteAsync(_event: IpcMainInvokeEvent, command: DeleteIdeaCommand): Promise<void>
	{
		const deletion = this.ideas.DeleteAsync(command);

		return deletion;
	}
}
