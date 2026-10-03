import type { TextSelection } from "../../../shared/library/SelectionTypes.js";
import type { ErrorRecord } from "../../../shared/diagnostics/DiagnosticManager.js";

// Every application event name and its payload shape, published on the shared ChoraEventBus.
export interface ChoraEvents
{
	"lookup.changed": Record<string, never>;
	"library.text-opened": Record<string, never>;
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
	"dream.opened": Record<string, never>;
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
	"patterns.changed": Record<string, never>;
	"error.reported": ErrorRecord;
}

export type { ErrorRecord } from "../../../shared/diagnostics/DiagnosticManager.js";
