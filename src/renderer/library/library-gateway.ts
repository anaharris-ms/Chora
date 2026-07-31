import type { LibraryText, LibraryTextSummary, SourceNotice } from "../../shared/library/library-types.js";
import type { SelectionAction } from "../../shared/library/selection-types.js";
import type { ApiSubscription } from "../../shared/contracts/chora-api.js";

export class LibraryGateway
{
	public ListAsync(): Promise<LibraryTextSummary[]>
	{
		return window.chora.ListLibraryTexts();
	}

	public LoadAsync(textId: string): Promise<LibraryText>
	{
		return window.chora.LoadLibraryText(textId);
	}

	public GetSourceNoticeAsync(textId: string): Promise<SourceNotice>
	{
		return window.chora.GetSourceNotice(textId);
	}

	public ShowSelectionContextMenuAsync(): Promise<SelectionAction>
	{
		return window.chora.ShowSelectionContextMenu();
	}

	public CopyAsync(text: string): Promise<void>
	{
		return window.chora.CopySelectedText(text);
	}

	public LookUpAsync(text: string): Promise<void>
	{
		return window.chora.LookUpWord(text);
	}

	public SubscribeToSelection(handler: (textId: string) => void): ApiSubscription
	{
		return window.chora.SubscribeLibraryTextSelected(handler);
	}

	public SubscribeToExternalText(handler: (text: LibraryText) => void): ApiSubscription
	{
		return window.chora.SubscribeExternalTextLoaded(handler);
	}
}
