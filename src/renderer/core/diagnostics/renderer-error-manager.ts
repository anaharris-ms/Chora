import { DiagnosticManager } from "../../../shared/diagnostics/diagnostic-manager.js";
import type { ChoraEvents } from "../events/chora-events.js";
import { ChoraEventBus } from "../events/chora-event-bus.js";

export class ErrorManager extends DiagnosticManager
{
	public constructor(events: ChoraEventBus<ChoraEvents>)
	{
		super((record) =>
		{
			if (record.userMessage !== undefined) void events.PublishAsync("error.reported", record);
		});
	}
}
