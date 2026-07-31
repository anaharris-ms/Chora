import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import type { LibraryTextSummary } from "../../shared/library/library-types.js";
import { IPC_CHANNELS } from "../../shared/contracts/ipc-channels.js";
import { ExternalTextLoader } from "../library/external-text-loader.js";
import { Errors } from "../diagnostics/main-error-manager.js";

function CreateLibraryItems(getWindow: () => BrowserWindow | null, works: LibraryTextSummary[]): MenuItemConstructorOptions[]
{
	const menuItems: MenuItemConstructorOptions[] = [];

	for (const work of works)
	{
		menuItems.push({
			label: work.title,
			click: () =>
			{
				const window = getWindow();

				if (window)
				{
					window.webContents.send(IPC_CHANNELS.selectLibraryText, work.id);
				}
			}
		});
	}

	return menuItems;
}

export function CreateApplicationMenu(getWindow: () => BrowserWindow | null, works: LibraryTextSummary[]): Menu
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
							const window = getWindow();
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
		},
		{
			label: "Library",
			submenu: CreateLibraryItems(getWindow, works)
		}
	];
	const menu = Menu.buildFromTemplate(menuTemplate);
	return menu;
}
