import { ApplicationModule } from "../bootstrap/ApplicationModule.js";
import { LibraryService } from "../library/LibraryService.js";
import { PatternIpcController } from "./PatternIpcController.js";
import { PatternRepository } from "./PatternRepository.js";
import { PatternService } from "./PatternService.js";

// Owns read-only Hermeneia Pattern composition and IPC registration.
export class PatternModule extends ApplicationModule
{
	// Pattern behavior backed by the configured Hermeneia export source.
	private readonly service: PatternService;
// Renderer IPC controller owned by this module.
	private readonly ipcController: PatternIpcController;

	// Creates the module with the Library identity resolver it depends on.
	public constructor(library: LibraryService)
	{
		super();
		this.service = new PatternService(library, new PatternRepository());
		this.ipcController = new PatternIpcController(this.service);
	}

	// Registers the Patterns IPC boundary.
	protected StartCore(): void
	{
		this.ipcController.Register();
	}

	// Removes the Patterns IPC boundary.
	protected StopCore(): void
	{
		this.ipcController.Unregister();
	}
}