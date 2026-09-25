import type { ChatMessage } from "../../../shared/chat/ChatTypes.js";
import type { TextSelection } from "../../../shared/library/SelectionTypes.js";
import type { LibraryText, SourceNotice } from "../../../shared/library/LibraryTypes.js";
import type { Dream } from "../../../shared/dreams/DreamTypes.js";
import type { ErrorRecord } from "../../../shared/diagnostics/DiagnosticManager.js";

// Every application event name and its payload shape, published on the shared ChoraEventBus.
export interface ChoraEvents
{
	"library.text-opened": { text: LibraryText; sourceNotice: SourceNotice | null };
	"library.text-open-requested": { textId: string };
	"library.selection-changed": { textId: string; hasSelection: boolean };
	"library.focus-changed": { textId: string; segmentKey: string };
	"library.jump-requested": { selection: TextSelection };
	"library.find-requested": { query: string; forward: boolean };
	"library.find-results-changed": { current: number; total: number };
	"dream.create-requested": { selection: TextSelection };
	"dream.signal-add-requested": { selection: TextSelection };
	"dream.source-extend-requested": { selection: TextSelection };
	"dream.signal-added": { dreamId: string; signalId: string };
	"dream.opened": { dream: Dream };
	// Requests that a specific signal (and, once mounted, its resonances) be revealed within the active Dream.
	"dream.signal-focus-requested": { dreamId: string; signalId: string };
	// Reports a passage selection chosen to attach to the currently armed resonance.
	"dream.resonance-target-attach-requested": { selection: TextSelection };
	// Announces a change to which resonance, if any, is armed to receive an attached passage.
	"dream.resonance-attach-armed-changed": Record<string, never>;
	"dream.catalogue-changed": { count: number };
	// Requests Dreams anchored to a displayed passage without navigating the text.
	"dream.passage-filter-requested": { workId: string; segmentKey: string };
	// Announces a change to the catalogue's source restriction.
	"dream.passage-filter-changed": Record<string, never>;
	"dream.closed": Record<string, never>;
	"dream.changed": { dreamId: string; isDirty: boolean };
	"dream.structure-changed": { dreamId: string };
	"dream.saved": { dream: Dream };
	"dream.save-state-changed": { state: "idle" | "saving" | "saved" | "error" };
	"chat.changed": { messages: ChatMessage[]; status: string };
	// Requests a conversation focused on one reader-selected signal.
	"chat.signal-requested": { dreamId: string; signalId: string };
	// Requests a conversation about the whole Dream, independent of any specific signal.
	"chat.dream-requested": { dreamId: string };
	// Announces that a conversation is ready for the reader's message.
	"chat.conversation-opened": Record<string, never>;
	"patterns.changed": Record<string, never>;
	"error.reported": ErrorRecord;
}

export type { ErrorRecord } from "../../../shared/diagnostics/DiagnosticManager.js";
