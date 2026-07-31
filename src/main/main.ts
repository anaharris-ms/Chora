import { app, BrowserWindow, Menu } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { existsSync } from "node:fs";
import path from "node:path";
import { CreateApplicationMenu } from "./shell/application-menu.js";
import { ChatService } from "./chat/chat-service.js";
import { ChatIpcController } from "./chat/chat-ipc-controller.js";
import { ChoraWindowManager } from "./bootstrap/window-manager.js";
import { Errors } from "./diagnostics/main-error-manager.js";
import { DreamIpcController } from "./dreams/dream-ipc-controller.js";
import { DreamRepository } from "./dreams/dream-repository.js";
import { DreamService } from "./dreams/dream-service.js";
import { IpcControllerRegistry } from "./ipc/ipc-handler-registry.js";
import { LibraryIpcController } from "./library/library-ipc-controller.js";
import { LibraryRepository } from "./library/library-repository.js";
import { LibraryService } from "./library/library-service.js";
import { LoadEnvironmentFiles } from "./bootstrap/environment.js";

const windows = new ChoraWindowManager();
let ipcControllers: IpcControllerRegistry | null = null;

app.disableHardwareAcceleration();

async function BootstrapApplicationAsync(): Promise<void>
{
	LoadEnvironmentFiles();
	const documentsPath = app.getPath("documents");
	const dreamPath = path.join(documentsPath, "Chora", "Dreams");
	const legacyDreamPaths = [path.join(documentsPath, "Chora", "Memories"), path.join(documentsPath, "Eigen", "Memories")].filter((candidate) => existsSync(candidate));
	const library = new LibraryService(new LibraryRepository());
	const dreams = new DreamService(new DreamRepository(dreamPath, legacyDreamPaths));
	const chatSessions = new ChatService();
	ipcControllers = new IpcControllerRegistry([new LibraryIpcController(library), new DreamIpcController(dreams), new ChatIpcController(chatSessions, library)]);
	ipcControllers.Register();
	windows.Open();
	const works = await library.ListAsync();
	const menu = CreateApplicationMenu(() => windows.GetWindow(), works);
	Menu.setApplicationMenu(menu);
}

if (squirrelStartup)
{
	app.quit();
}

app.whenReady().then(() =>
{
	BootstrapApplicationAsync().catch((error: unknown) =>
	{
		const message = error instanceof Error ? error.message : "Unable to start application.";
		Errors.Error("Application", message, error);
		app.quit();
	});
});

app.on("before-quit", () =>
{
	ipcControllers?.Unregister();
	ipcControllers = null;
});

app.on("window-all-closed", () =>
{
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () =>
{
	if (BrowserWindow.getAllWindows().length === 0) windows.Open();
});
