export type EventHandler<TEvent> = (event: TEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface EventHandlerFailure
{
	eventName: PropertyKey;
	error: unknown;
}

export type EventHandlerErrorHandler = (failure: EventHandlerFailure) => void | Promise<void>;

export class ChoraEventBus<TEvents extends object>
{
	private readonly handlers = new Map<keyof TEvents, Set<EventHandler<unknown>>>();
	private errorHandler: EventHandlerErrorHandler | null = null;
	private isReportingHandlerError = false;

	public SetErrorHandler(handler: EventHandlerErrorHandler): void
	{
		this.errorHandler = handler;
	}

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
