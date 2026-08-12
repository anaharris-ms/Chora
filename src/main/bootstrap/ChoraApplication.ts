import { Menu } from "electron";
import { ChatModule } from "../chat/ChatModule.js";
import { DreamModule } from "../dreams/DreamModule.js";
import { LibraryModule } from "../library/LibraryModule.js";
import { PatternModule } from "../patterns/PatternModule.js";
import { CreateApplicationMenu } from "../shell/ApplicationMenu.js";
import { LoadEnvironmentFiles } from "./Environment.js";
import { ChoraWindowManager } from "./WindowManager.js";

// Composes, starts, and stops Chora's main-process feature modules.
export class ChoraApplication
{
	// Owns Chora's native window lifecycle.
	private readonly windows = new ChoraWindowManager();
// Owns access to the bundled Library and its IPC boundary.
	private readonly library = new LibraryModule();
// Owns the configured read-only Hermeneia Pattern boundary.
	private readonly patterns = new PatternModule(this.library.GetService());
// Owns primary and legacy Dream persistence for this application run.
	private readonly dreams: DreamModule;
// Owns chat session state and its IPC boundary.
	private readonly chat: ChatModule;
// Tracks whether modules and native resources are currently active.
	private isStarted = false;

	// Creates the application from its operating-system-owned documents path.
	public constructor(documentsPath: string)
	{
		this.dreams = new DreamModule(documentsPath);
		this.chat = new ChatModule(this.library.GetService(), documentsPath);
	}

	// Loads configuration, starts modules, opens the window, and builds the application menu.
	public async StartAsync(): Promise<void>
	{
		if (!this.isStarted)
		{
			LoadEnvironmentFiles();
			this.library.Start();
			this.patterns.Start();
			this.dreams.Start();
			this.chat.Start();
			this.windows.Open();
			const works = await this.library.GetService().ListAsync();
			const menu = CreateApplicationMenu(this.windows, works);
			Menu.setApplicationMenu(menu);
			this.isStarted = true;
		}
	}

	// Stops feature modules before Electron tears down the main process.
	public Stop(): void
	{
		if (this.isStarted)
		{
			this.chat.Stop();
			this.dreams.Stop();
			this.patterns.Stop();
			this.library.Stop();
			this.isStarted = false;
		}
	}

	// Opens the existing window or creates a replacement window after macOS activation.
	public OpenWindow(): void
	{
		this.windows.Open();
	}
}