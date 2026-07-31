import { Menu, type MenuItemConstructorOptions } from "electron";
import type { SelectionAction } from "../../shared/library/selection-types.js";

export async function ShowSelectionContextMenu(): Promise<SelectionAction>
{
	const result = await new Promise<SelectionAction>((resolve) =>
	{
		const menuTemplate: MenuItemConstructorOptions[] = [
			{
				label: "Create Dream",
				click: () =>
				{
					resolve("create-dream");
				}
			},
			{
				label: "Add to Dream",
				click: () =>
				{
					resolve("add-to-dream");
				}
			},
			{
				label: "Add Signal",
				click: () =>
				{
					resolve("add-dream-signal");
				}
			},
			{ type: "separator" },
			{
				label: "Copy",
				click: () =>
				{
					resolve("copy");
				}
			},
			{
				label: "Look up",
				click: () =>
				{
					resolve("lookup");
				}
			}
		];
		const menu = Menu.buildFromTemplate(menuTemplate);
		menu.popup({
			callback: () =>
			{
				resolve(null);
			}
		});
	});
	return result;
}

export async function ShowDreamSourceContextMenu(): Promise<SelectionAction>
{
	const result = await new Promise<SelectionAction>((resolve) =>
	{
		const menu = Menu.buildFromTemplate([
			{ label: "Copy", click: () => resolve("copy-dream-source") },
			{ label: "Add Signal", click: () => resolve("add-dream-source-signal") }
		]);
		menu.popup({ callback: () => resolve(null) });
	});

	return result;
}
