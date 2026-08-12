import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/contracts/IpcChannels.js";
import type { PatternRecord } from "../../shared/patterns/PatternTypes.js";
import { PatternService } from "./PatternService.js";

// Exposes read-only Hermeneia patterns through Chora's typed IPC boundary.
export class PatternIpcController
{
	// IPC channels registered by this controller.
	private readonly channels = [IPC_CHANNELS.listPatterns] as const;
	// Bound Electron handler that lists patterns for one Library text.
	private readonly listHandler: (_event: IpcMainInvokeEvent, textId: string) => Promise<PatternRecord[]>;

	// Creates the controller with the Patterns application service.
	public constructor(private readonly service: PatternService)
	{
		this.listHandler = this.HandleListAsync.bind(this);
	}

	// Registers main-process handlers for the Patterns feature.
	public Register(): void
	{
		ipcMain.handle(IPC_CHANNELS.listPatterns, this.listHandler);
	}

	// Removes this controller's main-process handlers.
	public Unregister(): void
	{
		for (const channel of this.channels) ipcMain.removeHandler(channel);
	}

	// Lists patterns for the requested Library text through the application service.
	private HandleListAsync(_event: IpcMainInvokeEvent, textId: string): Promise<PatternRecord[]>
	{
		const patterns = this.service.GetAsync(textId);

		return patterns;
	}
}