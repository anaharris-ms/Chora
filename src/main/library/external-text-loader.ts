import fs from "node:fs/promises";
import { dialog, type BrowserWindow, type OpenDialogOptions } from "electron";
import type { LibraryText } from "../../shared/library/library-types.js";
import { BuildExternalText } from "./external-text-model.js";

export class ExternalTextLoader
{
	public async OpenAsync(window: BrowserWindow | null): Promise<LibraryText | null>
	{
		const dialogOptions = {
		title: "Open Text",
		properties: ["openFile"],
		filters: [
			{
				name: "Text Files",
				extensions: ["txt"]
			}
		]
		} satisfies OpenDialogOptions;
		let result: LibraryText | null = null;
		const dialogResult = window
			? await dialog.showOpenDialog(window, dialogOptions)
			: await dialog.showOpenDialog(dialogOptions);

		if (!dialogResult.canceled && dialogResult.filePaths.length > 0)
		{
			const filePath = dialogResult.filePaths[0];

			if (filePath)
			{
				const fileText = await fs.readFile(filePath, "utf8");
				result = BuildExternalText(filePath, fileText);
			}
		}

		return result;
	}
}
