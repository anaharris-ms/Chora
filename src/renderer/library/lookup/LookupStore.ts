import type { LookupState } from "../../../shared/library/LookupTypes.js";

// Owns the renderer's snapshot of dictionary state.
export class LookupStore
{
	private state: LookupState = { open: false, url: "", loading: false, canGoBack: false, canGoForward: false, error: null };

	public GetState(): LookupState
	{
		return { ...this.state };
	}

	public SetState(state: LookupState): void
	{
		this.state = { ...state };
	}
}