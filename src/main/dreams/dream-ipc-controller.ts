import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/contracts/ipc-channels.js";
import type { Dream } from "../../shared/dreams/dream-types.js";
import { DreamService } from "./dream-service.js";

export class DreamIpcController
{
	private readonly channels = [IPC_CHANNELS.saveDream, IPC_CHANNELS.deleteDream, IPC_CHANNELS.listDreams] as const;

	public constructor(private readonly service: DreamService)
	{
	}

	public Register(): void
	{
		ipcMain.handle(IPC_CHANNELS.saveDream, (_event, dream: Dream) => this.service.SaveAsync(dream));
		ipcMain.handle(IPC_CHANNELS.deleteDream, (_event, dreamId: string) => this.service.DeleteAsync(dreamId));
		ipcMain.handle(IPC_CHANNELS.listDreams, () => this.service.ListAsync());
	}

	public Unregister(): void
	{
		for (const channel of this.channels) ipcMain.removeHandler(channel);
	}
}
