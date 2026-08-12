// Base class for a main-process feature that owns a deterministic lifecycle.
export abstract class ApplicationModule
{
	// Whether this module has registered its resources.
	private isStarted = false;

	// Starts the module once.
	public Start(): void
	{
		if (!this.isStarted)
		{
			this.StartCore();
			this.isStarted = true;
		}
	}

	// Stops the module once after it has started.
	public Stop(): void
	{
		if (this.isStarted)
		{
			this.StopCore();
			this.isStarted = false;
		}
	}

	// Registers resources owned by the derived feature.
	protected abstract StartCore(): void;

	// Releases resources owned by the derived feature.
	protected abstract StopCore(): void;
}