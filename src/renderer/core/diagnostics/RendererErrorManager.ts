import { DiagnosticManager } from "../../../shared/diagnostics/DiagnosticManager.js";
import type { ChoraEvents } from "../events/ChoraEvents.js";
import { ChoraEventBus } from "../events/ChoraEventBus.js";

// Reports diagnostics and forwards user-facing errors onto the application event bus.
export class ErrorManager extends DiagnosticManager
{
	// Publishes every user-facing diagnostic as an "error.reported" application event.
	public constructor(events: ChoraEventBus<ChoraEvents>)
	{
		super((record) =>
		{
			if (record.userMessage !== undefined) void events.PublishAsync("error.reported", record);
		});
	}
}
