import type { Dream } from "../../shared/dreams/DreamTypes.js";
import type { SelectionAction } from "../../shared/library/SelectionTypes.js";

// Stateless IPC client for the Dream use cases exposed by the main process.
export class DreamGateway
{
	// Lists all Dreams visible to the reader.
	public ListAsync(): Promise<Dream[]>
	{
		return window.chora.ListDreams();
	}

	// Saves one Dream record through the main-process Dream service.
	public SaveAsync(dream: Dream): Promise<Dream>
	{
		return window.chora.SaveDream(dream);
	}

	// Deletes one Dream record through the main-process Dream service.
	public DeleteAsync(dreamId: string): Promise<void>
	{
		return window.chora.DeleteDream(dreamId);
	}

	// Shows the native context menu for a Dream source-passage selection.
	public ShowSourceContextMenuAsync(): Promise<SelectionAction>
	{
		return window.chora.ShowDreamSourceContextMenu();
	}

	// Copies the given text to the operating system clipboard.
	public CopyAsync(text: string): Promise<void>
	{
		return window.chora.CopySelectedText(text);
	}

	// Allocates a new canonical identifier for a Dream or Dream signal from the main process.
	public AllocateIdAsync(): Promise<string>
	{
		return window.chora.AllocateDreamId();
	}
}
