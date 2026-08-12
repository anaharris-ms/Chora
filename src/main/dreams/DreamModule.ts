import { existsSync } from "node:fs";
import path from "node:path";
import { ApplicationModule } from "../bootstrap/ApplicationModule.js";
import { DreamLibrary } from "./DreamLibrary.js";
import { DreamIpcController } from "./DreamIpcController.js";
import { DreamRepository } from "./DreamRepository.js";
import { DreamService } from "./DreamService.js";

// Owns primary and legacy Dream library composition and IPC registration.
export class DreamModule extends ApplicationModule
{
	// Dream behavior backed by the primary and legacy persistence roots.
	private readonly service: DreamService;
// Renderer IPC controller owned by this module.
	private readonly ipcController: DreamIpcController;

	// Creates the module from the operating system's documents directory.
	public constructor(documentsPath: string)
	{
		super();
		const primaryPath = path.join(documentsPath, "Chora", "Dreams");
		const legacyPaths = this.GetLegacyPaths(documentsPath);
		const repository = new DreamRepository(primaryPath, legacyPaths);
		const library = new DreamLibrary(primaryPath, repository);
		this.service = new DreamService(library);
		this.ipcController = new DreamIpcController(this.service);
	}

	// Registers the Dreams IPC boundary.
	protected StartCore(): void
	{
		this.ipcController.Register();
	}

	// Removes the Dreams IPC boundary.
	protected StopCore(): void
	{
		this.ipcController.Unregister();
	}

	// Locates read-only legacy libraries without creating them.
	private GetLegacyPaths(documentsPath: string): string[]
	{
		const candidates = [path.join(documentsPath, "Chora", "Memories"), path.join(documentsPath, "Eigen", "Memories")];
		const legacyPaths: string[] = [];

		for (const candidate of candidates)
		{
			if (existsSync(candidate))
			{
				legacyPaths.push(candidate);
			}
		}

		return legacyPaths;
	}
}