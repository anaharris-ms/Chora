import { Menu, type BrowserWindow, type ContextMenuParams, type MenuItemConstructorOptions } from "electron";
import type { SelectionAction } from "../../shared/library/SelectionTypes.js";

// Shows the native editing menu, including spelling suggestions, for a right-clicked editable field.
export function ShowEditContextMenu(window: BrowserWindow, params: ContextMenuParams): void
{
	const webContents = window.webContents;
	const menuTemplate: MenuItemConstructorOptions[] = [];

	if (params.misspelledWord.length > 0)
	{
		for (const suggestion of params.dictionarySuggestions)
		{
			menuTemplate.push({ label: suggestion, click: () => webContents.replaceMisspelling(suggestion) });
		}
		if (params.dictionarySuggestions.length === 0) menuTemplate.push({ label: "No suggestions", enabled: false });
		menuTemplate.push({ type: "separator" });
		menuTemplate.push({ label: "Add to dictionary", click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
		menuTemplate.push({ type: "separator" });
	}

	menuTemplate.push({ role: "cut", enabled: params.editFlags.canCut });
	menuTemplate.push({ role: "copy", enabled: params.editFlags.canCopy });
	menuTemplate.push({ role: "paste", enabled: params.editFlags.canPaste });
	menuTemplate.push({ type: "separator" });
	menuTemplate.push({ role: "selectAll", enabled: params.editFlags.canSelectAll });

	const menu = Menu.buildFromTemplate(menuTemplate);
	menu.popup({ window });
}

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
			{
				label: "Attach to Resonance",
				click: () =>
				{
					resolve("attach-resonance-target");
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
