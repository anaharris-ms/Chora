import type { FormattingAction } from "../../shared/contracts/ChoraApi.js";

export class MarkdownEditorGateway
{
	public ShowFormattingMenuAsync(): Promise<FormattingAction>
	{
		const action = window.chora.ShowFormattingContextMenu();
		return action;
	}
}