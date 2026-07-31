export interface IpcController
{
	Register(): void;
	Unregister(): void;
}

export class IpcControllerRegistry
{
	public constructor(private readonly controllers: readonly IpcController[])
	{
	}

	public Register(): void
	{
		for (const controller of this.controllers) controller.Register();
	}

	public Unregister(): void
	{
		for (const controller of this.controllers) controller.Unregister();
	}
}
