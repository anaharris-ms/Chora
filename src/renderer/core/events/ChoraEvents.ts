import type { TextSelection } from "../../../shared/library/SelectionTypes.js";
import type { ErrorRecord } from "../../../shared/diagnostics/DiagnosticManager.js";

// Every application event name and its payload shape, published on the shared ChoraEventBus.
export interface ChoraEvents
{
	"lookup.changed": Record<string, never>;
	"library.text-opened": Record<string, never>;
	"library.text-open-requested": { textId: string };
	"library.focus-changed": { textId: string; segmentKey: string };
	"library.selection-changed": Record<string, never>;
	"library.jump-requested": { selection: TextSelection };
	// Requests focus on the Dreams Explorer without opening a Dream.
	"workspace.dreams-focus-requested": Record<string, never>;
	"workspace.document-selected": { kind: "dream" | "idea" | null };
	// Requests selection of a durable Idea for one existing Signal.
	"idea.add-signal-requested": { dreamId: string; signalId: string };
	// Requests that an Idea-referenced Signal open in the established Dream editor.
	"idea.signal-view-requested": { dreamId: string; signalId: string };
	// Requests a return from an Idea-referenced Signal preview to the active Idea.
	"idea.return-requested": Record<string, never>;
	// Announces a change to renderer-owned Idea state.
	"ideas.changed": Record<string, never>;
	// Announces draft text changes without forcing the editor to rebuild while typing.
	"idea.draft-changed": Record<string, never>;
	"dream.create-requested": { selection: TextSelection };
	"dream.signal-add-requested": { selection: TextSelection };
	"dream.source-extend-requested": { selection: TextSelection };
	"dream.signal-added": { dreamId: string; signalId: string };
	"dream.opened": Record<string, never>;
	// Requests that a specific signal be revealed within the active Dream.
	"dream.signal-focus-requested": { dreamId: string; signalId: string };
	"dream.catalogue-changed": { count: number };
	// Requests Dreams anchored to a displayed passage without navigating the text.
	"dream.passage-filter-requested": { workId: string; segmentKey: string };
	// Announces a change to the catalogue's source restriction.
	"dream.passage-filter-changed": Record<string, never>;
	"dream.closed": Record<string, never>;
	"dream.changed": Record<string, never>;
	"dream.structure-changed": { dreamId: string };
	"dream.saved": Record<string, never>;
	"dream.save-state-changed": Record<string, never>;
	"chat.changed": Record<string, never>;
	// Requests a conversation focused on one reader-selected signal.
	"chat.signal-requested": { dreamId: string; signalId: string };
	// Requests a conversation about the whole Dream, independent of any specific signal.
	"chat.dream-requested": { dreamId: string };
	// Announces that a conversation is ready for the reader's message.
	"chat.conversation-opened": Record<string, never>;
	"error.reported": ErrorRecord;
}

export type { ErrorRecord } from "../../../shared/diagnostics/DiagnosticManager.js";
