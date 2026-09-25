import type { ChatContext, DreamChatContext } from "../../../shared/chat/ChatTypes.js";
import { LibraryStore } from "../../library/LibraryStore.js";
import { DreamStore } from "../../dreams/DreamStore.js";

// Derives the chat context (Dream, passage selection, or none) from the current reading state.
export class ReadingContextBuilder
{
	// Creates the builder from the stores it reads to derive context.
	public constructor(
		private readonly library: LibraryStore,
		private readonly dreams: DreamStore)
	{
	}

	// Resolves an explicit signal focus using the latest unsaved editor contents.
	public GetSignalContext(dreamId: string, signalId: string): DreamChatContext | null
	{
		const dream = this.dreams.GetActiveDream();
		let context: DreamChatContext | null = null;
		if (dream !== null && dream.id === dreamId)
		{
			for (const signal of dream.signals)
			{
				if (signal.id === signalId)
				{
					const current = this.GetContext();
					if (current.mode === "DREAM")
					{
						current.dream.focusedSignal = { id: signal.id, text: signal.text, description: signal.description };
						context = current;
					}
					break;
				}
			}
		}
		return context;
	}

	// Prefers an open Dream's source passage, then the reader's current selection, then no context.
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
