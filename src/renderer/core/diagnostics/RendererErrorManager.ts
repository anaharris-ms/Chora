import { DiagnosticManager } from "../../../shared/diagnostics/DiagnosticManager.js";
import type { ChoraEvents } from "../events/ChoraEvents.js";
import { ChoraEventBus } from "../events/ChoraEventBus.js";

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
