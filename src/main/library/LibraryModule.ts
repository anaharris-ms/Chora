import { ApplicationModule } from "../bootstrap/ApplicationModule.js";
import { LibraryIpcController } from "./LibraryIpcController.js";
import { LibraryRepository } from "./LibraryRepository.js";
import { LibraryService } from "./LibraryService.js";

// Owns Library composition and its renderer-facing IPC boundary.
export class LibraryModule extends ApplicationModule
{
	// Library behavior shared with dependent main-process features.
	private readonly service = new LibraryService(new LibraryRepository());
// Renderer IPC controller owned by this module.
	private readonly ipcController = new LibraryIpcController(this.service);

	// Returns the Library behavior required by other main-process modules.
	public GetService(): LibraryService
	{
		return this.service;
	}

	// Registers the Library IPC boundary.
	protected StartCore(): void
	{
		this.ipcController.Register();
	}

	// Removes the Library IPC boundary.
	protected StopCore(): void
	{
		this.ipcController.Unregister();
	}
}