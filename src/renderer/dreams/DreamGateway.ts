import type { Dream } from "../../shared/dreams/DreamTypes.js";
import type { SelectionAction } from "../../shared/library/SelectionTypes.js";

export class DreamGateway
{
	public ListAsync(): Promise<Dream[]>
	{
		return window.chora.ListDreams();
	}

	public SaveAsync(dream: Dream): Promise<Dream>
	{
		return window.chora.SaveDream(dream);
	}

	public DeleteAsync(dreamId: string): Promise<void>
	{
		return window.chora.DeleteDream(dreamId);
	}

	public ShowSourceContextMenuAsync(): Promise<SelectionAction>
	{
		return window.chora.ShowDreamSourceContextMenu();
	}

	public CopyAsync(text: string): Promise<void>
	{
		return window.chora.CopySelectedText(text);
	}
}
