import type { ChatContext } from "../../../shared/chat/ChatTypes.js";
import { LibraryStore } from "../../library/LibraryStore.js";
import { DreamStore } from "../../dreams/DreamStore.js";

export class ReadingContextBuilder
{
	public constructor(private readonly library: LibraryStore, private readonly dreams: DreamStore)
	{
	}

	public GetContext(): ChatContext
	{
		const dream = this.dreams.GetActiveDream();
		const document = this.library.GetText();
		const selection = this.library.GetContextSelection();
		let context: ChatContext = { mode: "FREE" };

		if (dream !== null)
		{
			context = {
				mode: "DREAM", documentId: dream.source.documentId, sourcePassage: dream.source.selectedText,
				contextBefore: dream.source.contextBefore ?? "", contextAfter: dream.source.contextAfter ?? "",
				locator: dream.source.locatorStart, start: dream.source.start, end: dream.source.end,
				dream: { id: dream.id, title: dream.title, exegesis: dream.reflection, signals: dream.signals.map((signal) => ({ text: signal.text, description: signal.description })) }
			};
		}
		else if (document !== null && selection !== null)
		{
			context = {
				mode: "TEXT", documentId: document.id, sourcePassage: selection.selectedText,
				contextBefore: "", contextAfter: "", locator: selection.locatorStart,
				start: selection.start, end: selection.end
			};
		}

		return context;
	}
}
