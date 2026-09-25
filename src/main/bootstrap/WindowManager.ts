import { app, BrowserWindow, type ContextMenuParams, type Event, type RenderProcessGoneDetails } from "electron";
import path from "node:path";
import { Errors } from "../diagnostics/MainErrorManager.js";
import { ShowEditContextMenu } from "../shell/ContextMenu.js";

// Owns Chora's single native BrowserWindow instance and its lifecycle.
export class ChoraWindowManager
{
	// The currently open window, or null when no window is open.
	private window: BrowserWindow | null = null;

	// Returns the existing window, or creates and opens a new one.
	public Open(): BrowserWindow
	{
		if (this.window === null)
		{
			this.window = this.Create();
		}

		return this.window;
	}

	// Returns the current window, or null when no window is open.
	public GetWindow(): BrowserWindow | null
	{
		return this.window;
	}

	private Create(): BrowserWindow
	{
		const window = new BrowserWindow({
			width: 1500,
			height: 960,
			minWidth: 760,
			minHeight: 540,
			resizable: true,
			backgroundColor: "#0f1115",
			webPreferences: {
				preload: path.join(app.getAppPath(), ".vite", "build", "src", "preload", "preload.js"),
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true
			}
		});
		void window.loadFile(path.join(app.getAppPath(), ".vite", "renderer", "src", "renderer", "index.html"));
		window.on("closed", this.HandleWindowClosed.bind(this, window));
		window.webContents.on("context-menu", this.HandleContextMenu.bind(this, window));
		window.webContents.on("render-process-gone", this.HandleRenderProcessGone.bind(this));
		window.on("unresponsive", this.HandleWindowUnresponsive.bind(this));

		return window;
	}

	// Clears the tracked window once the given window has closed.
	private HandleWindowClosed(window: BrowserWindow): void
	{
		if (this.window === window) this.window = null;
	}

	// Shows the native editing menu for a right-clicked editable field.
	private HandleContextMenu(window: BrowserWindow, _event: Event, params: ContextMenuParams): void
	{
		if (params.isEditable) ShowEditContextMenu(window, params);
	}

	// Reports an unexpected renderer process termination.
	private HandleRenderProcessGone(_event: Event, details: RenderProcessGoneDetails): void
	{
		Errors.Error("ElectronWindow", "Chora browser process ended.", details);
	}

	// Reports that the window's renderer stopped responding.
	private HandleWindowUnresponsive(): void
	{
		Errors.Error("ElectronWindow", "Chora window became unresponsive.");
	}
}
