import type { LookupBounds, LookupCommand, LookupState } from "../../../shared/library/LookupTypes.js";
import { ChoraEventBus, type Unsubscribe } from "../../core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../../core/events/ChoraEvents.js";
import { ErrorManager } from "../../core/diagnostics/RendererErrorManager.js";
import { LookupGateway } from "./LookupGateway.js";
import { LookupStore } from "./LookupStore.js";

// Coordinates dictionary state and commands without owning DOM or native views.
export class LookupController
{
	private unsubscribe: Unsubscribe | null = null;
	private revision = 0;
	private disposed = false;

	public constructor(private readonly events: ChoraEventBus<ChoraEvents>, private readonly store: LookupStore, private readonly gateway: LookupGateway, private readonly errors: ErrorManager)
	{
	}

	public async StartAsync(): Promise<void>
	{
		this.unsubscribe = this.gateway.Subscribe(this.HandleState.bind(this));
		const revision = this.revision;
		try
		{
			const state = await this.gateway.GetStateAsync();
			if (!this.disposed && revision === this.revision) this.HandleState(state);
		}
		catch (error)
		{
			this.errors.Report("LookupController", error, "Unable to initialize dictionary.");
		}
	}

	public async ExecuteAsync(command: LookupCommand): Promise<void>
	{
		try
		{
			await this.gateway.ExecuteAsync(command);
		}
		catch (error)
		{
			this.errors.Report("LookupController", error, "Unable to update dictionary.");
		}
	}

	public async SetBoundsAsync(bounds: LookupBounds | null): Promise<void>
	{
		try
		{
			await this.gateway.SetBoundsAsync(bounds);
		}
		catch (error)
		{
			if (!this.disposed) this.errors.Report("LookupController", error, "Unable to position dictionary.");
		}
	}

	public Dispose(): void
	{
		this.disposed = true;
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private HandleState(state: LookupState): void
	{
		if (!this.disposed)
		{
			this.revision += 1;
			this.store.SetState(state);
			void this.events.PublishAsync("lookup.changed", {});
		}
	}
}