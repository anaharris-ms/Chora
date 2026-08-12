import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/contracts/IpcChannels.js";
import type { Dream } from "../../shared/dreams/DreamTypes.js";
import { DreamService } from "./DreamService.js";

export class DreamIpcController
{
	// IPC channels registered by this controller.
	private readonly channels = [IPC_CHANNELS.saveDream, IPC_CHANNELS.deleteDream, IPC_CHANNELS.listDreams] as const;
	// Bound Electron handler that persists one Dream record.
	private readonly saveHandler: (_event: IpcMainInvokeEvent, dream: Dream) => Promise<Dream>;
	// Bound Electron handler that deletes one Dream record.
	private readonly deleteHandler: (_event: IpcMainInvokeEvent, dreamId: string) => Promise<void>;
	// Bound Electron handler that lists all visible Dreams.
	private readonly listHandler: () => Promise<Dream[]>;

	// Creates the IPC boundary for the Dream use-case service.
	public constructor(private readonly service: DreamService)
	{
		this.saveHandler = this.HandleSaveAsync.bind(this);
		this.deleteHandler = this.HandleDeleteAsync.bind(this);
		this.listHandler = this.HandleListAsync.bind(this);
	}

	// Registers Dream use cases with Electron's main-process IPC registry.
	public Register(): void
	{
		ipcMain.handle(IPC_CHANNELS.saveDream, this.saveHandler);
		ipcMain.handle(IPC_CHANNELS.deleteDream, this.deleteHandler);
		ipcMain.handle(IPC_CHANNELS.listDreams, this.listHandler);
	}

	// Removes Dream use cases from Electron's main-process IPC registry.
	public Unregister(): void
	{
		for (const channel of this.channels) ipcMain.removeHandler(channel);
	}

	// Saves one renderer-submitted Dream through the application service.
	private HandleSaveAsync(_event: IpcMainInvokeEvent, dream: Dream): Promise<Dream>
	{
		const saved = this.service.SaveAsync(dream);

		return saved;
	}

	// Deletes one renderer-requested Dream through the application service.
	private HandleDeleteAsync(_event: IpcMainInvokeEvent, dreamId: string): Promise<void>
	{
		const deletion = this.service.DeleteAsync(dreamId);

		return deletion;
	}

	// Lists all Dreams visible to the renderer.
	private HandleListAsync(): Promise<Dream[]>
	{
		const dreams = this.service.ListAsync();

		return dreams;
	}
}
