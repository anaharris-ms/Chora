import { app, BrowserWindow } from "electron";
import path from "node:path";
import { Errors } from "../diagnostics/main-error-manager.js";

export class ChoraWindowManager
{
	private window: BrowserWindow | null = null;

	public Open(): BrowserWindow
	{
		if (this.window === null)
		{
			const window = this.Create();
			this.window = window;
			window.on("closed", () =>
			{
				if (this.window === window) this.window = null;
			});
		}

		return this.window;
	}

	public GetWindow(): BrowserWindow | null
	{
		return this.window;
	}

	private Create(): BrowserWindow
	{
		const window = new BrowserWindow({
			width: 1500,
			height: 960,
			backgroundColor: "#0f1115",
			webPreferences: {
				preload: path.join(app.getAppPath(), ".vite", "build", "src", "preload", "preload.js"),
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true
			}
		});
		void window.loadFile(path.join(app.getAppPath(), ".vite", "renderer", "src", "renderer", "index.html"));
		window.webContents.on("render-process-gone", (_event, details) =>
		{
			Errors.Error("ElectronWindow", "Chora browser process ended.", details);
		});
		window.on("unresponsive", () =>
		{
			Errors.Error("ElectronWindow", "Chora window became unresponsive.");
		});

		return window;
	}
}
