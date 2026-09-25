import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import type { LibraryTextSummary } from "../../shared/library/LibraryTypes.js";
import { IPC_CHANNELS } from "../../shared/contracts/IpcChannels.js";
import { ExternalTextLoader } from "../library/ExternalTextLoader.js";
import { Errors } from "../diagnostics/MainErrorManager.js";

// Supplies the currently active BrowserWindow to native menu actions.
export interface BrowserWindowProvider
{
	GetWindow(): BrowserWindow | null;
}

export function CreateApplicationMenu(windows: BrowserWindowProvider, _works: LibraryTextSummary[]): Menu
{
	const externalTexts = new ExternalTextLoader();
	const menuTemplate: MenuItemConstructorOptions[] = [
		{
			label: "File",
			submenu: [
				{
					label: "Open Text...",
					accelerator: "CmdOrCtrl+O",
					click: async () =>
					{
						try
						{
							const window = windows.GetWindow();
							const work = await externalTexts.OpenAsync(window);

							if (window && work)
							{
								window.webContents.send(IPC_CHANNELS.externalTextLoaded, work);
							}
						}
						catch (error)
						{
							const message = error instanceof Error ? error.message : "Unable to open text file.";
							Errors.Error("ApplicationMenu", message, error);
						}
					}
				},
				{
					type: "separator"
				},
				{
					role: "quit"
				}
			]
		}
	];
	const menu = Menu.buildFromTemplate(menuTemplate);
	return menu;
}
