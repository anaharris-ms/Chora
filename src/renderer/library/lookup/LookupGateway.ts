import type { LookupBounds, LookupCommand, LookupState } from "../../../shared/library/LookupTypes.js";
import type { ApiSubscription } from "../../../shared/contracts/ChoraApi.js";

// Dictionary IPC access; external content never enters this renderer.
export class LookupGateway
{
	public GetStateAsync(): Promise<LookupState>
	{
		return window.chora.GetLookupState();
	}

	public SetBoundsAsync(bounds: LookupBounds | null): Promise<void>
	{
		return window.chora.SetLookupBounds(bounds);
	}

	public ExecuteAsync(command: LookupCommand): Promise<void>
	{
		return window.chora.ExecuteLookupCommand(command);
	}

	public Subscribe(handler: (state: LookupState) => void): ApiSubscription
	{
		return window.chora.SubscribeLookupState(handler);
	}
}