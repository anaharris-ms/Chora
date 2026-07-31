import type { ChatMessage } from "../../../shared/chat/chat-types.js";
import type { TextSelection } from "../../../shared/library/selection-types.js";
import type { LibraryText, SourceNotice } from "../../../shared/library/library-types.js";
import type { Dream } from "../../../shared/dreams/dream-types.js";
import type { ErrorRecord } from "../../../shared/diagnostics/diagnostic-manager.js";

export interface ChoraEvents
{
	"library.text-opened": { text: LibraryText; sourceNotice: SourceNotice | null };
	"library.text-open-requested": { textId: string };
	"library.selection-changed": { textId: string; hasSelection: boolean };
	"library.focus-changed": { textId: string; segmentKey: string };
	"library.jump-requested": { selection: TextSelection };
	"dream.create-requested": { selection: TextSelection };
	"dream.signal-add-requested": { selection: TextSelection };
	"dream.source-extend-requested": { selection: TextSelection };
	"dream.signal-added": { dreamId: string; signalId: string };
	"dream.opened": { dream: Dream };
	"dream.catalogue-changed": { count: number };
	"dream.closed": Record<string, never>;
	"dream.changed": { dreamId: string; isDirty: boolean };
	"dream.structure-changed": { dreamId: string };
	"dream.saved": { dream: Dream };
	"dream.save-state-changed": { state: "idle" | "saving" | "saved" | "error" };
	"chat.changed": { messages: ChatMessage[]; status: string };
	"error.reported": ErrorRecord;
}

export type { ErrorRecord } from "../../../shared/diagnostics/diagnostic-manager.js";
