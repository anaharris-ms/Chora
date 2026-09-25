// Signature every event-bus subscriber must implement.
export type EventHandler<TEvent> = (event: TEvent) => void | Promise<void>;
// Removes a previously registered subscriber.
export type Unsubscribe = () => void;

// Describes a subscriber that threw while handling an event.
export interface EventHandlerFailure
{
	eventName: PropertyKey;
	error: unknown;
}

// Reports a subscriber failure without disrupting delivery to the remaining subscribers.
export type EventHandlerErrorHandler = (failure: EventHandlerFailure) => void | Promise<void>;

// Typed publish/subscribe bus for renderer-wide application events.
export class ChoraEventBus<TEvents extends object>
{
	// Subscribers registered per event name.
	private readonly handlers = new Map<keyof TEvents, Set<EventHandler<unknown>>>();
	// Reports subscriber failures, or null when none is registered.
	private errorHandler: EventHandlerErrorHandler | null = null;
	// Guards against a failing error handler recursively reporting its own failure.
	private isReportingHandlerError = false;

	// Registers the handler invoked when a subscriber throws while handling an event.
	public SetErrorHandler(handler: EventHandlerErrorHandler): void
	{
		this.errorHandler = handler;
	}

	// Registers a subscriber for an event and returns a function that removes it.
	public Subscribe<TKey extends keyof TEvents>(eventName: TKey, handler: EventHandler<TEvents[TKey]>): Unsubscribe
	{
		let eventHandlers = this.handlers.get(eventName);

		if (eventHandlers === undefined)
		{
			eventHandlers = new Set<EventHandler<unknown>>();
			this.handlers.set(eventName, eventHandlers);
		}

		eventHandlers.add(handler as EventHandler<unknown>);

		const unsubscribe = (): void =>
		{
			eventHandlers?.delete(handler as EventHandler<unknown>);
		};

		return unsubscribe;
	}

	// Awaits every subscriber for an event, reporting (rather than propagating) any subscriber failure.
	public async PublishAsync<TKey extends keyof TEvents>(eventName: TKey, event: TEvents[TKey]): Promise<void>
	{
		const eventHandlers = [...(this.handlers.get(eventName) ?? [])];

		for (const handler of eventHandlers)
		{
			try
			{
				await handler(event);
			}
			catch (error)
			{
				await this.ReportHandlerErrorAsync(eventName, error);
			}
		}
	}

	// Reports a subscriber failure to the registered error handler, ignoring any failure it raises itself.
	private async ReportHandlerErrorAsync(eventName: keyof TEvents, error: unknown): Promise<void>
	{
		const canReport = this.errorHandler !== null && !this.isReportingHandlerError;

		if (canReport)
		{
			this.isReportingHandlerError = true;

			try
			{
				await this.errorHandler?.({ eventName, error });
			}
			catch
			{
			}
			finally
			{
				this.isReportingHandlerError = false;
			}
		}
	}
}
