import { session, shell, WebContentsView, type BrowserWindow, type Event } from "electron";
import type { LookupBounds, LookupCommand, LookupState } from "../../shared/library/LookupTypes.js";
import { IPC_CHANNELS } from "../../shared/contracts/IpcChannels.js";
import { ChoraWindowManager } from "../bootstrap/WindowManager.js";
import { Errors } from "../diagnostics/MainErrorManager.js";
import { CreateLogeionUrl } from "./LogeionUrl.js";

// Owns the sandboxed external dictionary view and its native-window lifecycle.
export class LookupService
{
	private view: WebContentsView | null = null;
	private owner: BrowserWindow | null = null;
	private bounds: LookupBounds | null = null;
	private state: LookupState = { open: false, url: "", loading: false, canGoBack: false, canGoForward: false, error: null };
	private historyNavigationPending = false;
	private readonly closeHandler = this.Close.bind(this);
	private readonly resizeHandler = this.Hide.bind(this);

	public constructor(private readonly windows: ChoraWindowManager)
	{
	}

	public GetState(): LookupState
	{
		return this.state;
	}

	public static IsAllowedUrl(value: string): boolean
	{
		let allowed = false;
		try
		{
			const url = new URL(value);
			allowed = url.origin === "https://logeion.uchicago.edu" && url.username === "" && url.password === "";
		}
		catch
		{
			allowed = false;
		}
		return allowed;
	}

	public async OpenAsync(text: string): Promise<void>
	{
		const url = CreateLogeionUrl(text);
		const window = this.windows.GetWindow();
		if (url !== null && window !== null && LookupService.IsAllowedUrl(url))
		{
			if (this.view === null) this.Create(window);
			this.historyNavigationPending = false;
			this.state = { open: true, url, loading: true, canGoBack: false, canGoForward: false, error: null };
			this.Publish();
			const view = this.view;
			try
			{
				await view?.webContents.loadURL(url);
			}
			catch (error)
			{
				if (this.view === view && this.state.url === url && this.state.error === null)
				{
					this.Fail("Dictionary could not be loaded. Retry or open it in your browser.");
					Errors.Error("LookupService", "Dictionary navigation failed.", error);
				}
			}
		}
	}

	public SetBounds(bounds: LookupBounds | null): void
	{
		this.bounds = bounds;
		if (this.view !== null && this.owner !== null)
		{
			const visible = bounds !== null && this.state.open && this.state.error === null && bounds.width > 0 && bounds.height > 0;
			if (bounds !== null && visible)
			{
				const zoom = this.owner.webContents.getZoomFactor();
				const size = this.owner.getContentBounds();
				const x = Math.max(0, Math.min(size.width, Math.round(bounds.x * zoom)));
				const y = Math.max(0, Math.min(size.height, Math.round(bounds.y * zoom)));
				const width = Math.max(0, Math.min(size.width - x, Math.round(bounds.width * zoom)));
				const height = Math.max(0, Math.min(size.height - y, Math.round(bounds.height * zoom)));
				this.view.setBounds({ x, y, width, height });
			}
			this.view.setVisible(visible);
		}
	}

	public async ExecuteAsync(command: LookupCommand): Promise<void>
	{
		const contents = this.view?.webContents;
		if (command === "close") this.Close();
		if (command === "back" && contents?.navigationHistory.canGoBack())
		{
			this.historyNavigationPending = true;
			contents.navigationHistory.goBack();
		}
		if (command === "forward" && contents?.navigationHistory.canGoForward())
		{
			this.historyNavigationPending = true;
			contents.navigationHistory.goForward();
		}
		if (command === "reload" && contents !== undefined)
		{
			this.state = { ...this.state, error: null, loading: true };
			this.Publish();
			contents.reload();
		}
		if (command === "external" && LookupService.IsAllowedUrl(this.state.url)) await shell.openExternal(this.state.url);
	}

	public Close(): void
	{
		const owner = this.owner;
		const view = this.view;
		this.owner = null;
		this.view = null;
		this.bounds = null;
		this.historyNavigationPending = false;
		this.state = { open: false, url: "", loading: false, canGoBack: false, canGoForward: false, error: null };
		if (owner !== null)
		{
			owner.removeListener("closed", this.closeHandler);
			owner.removeListener("resize", this.resizeHandler);
			if (!owner.isDestroyed())
			{
				const host = owner.webContents;
				host.removeListener("did-start-loading", this.closeHandler);
				if (view !== null) owner.contentView.removeChildView(view);
				if (!host.isDestroyed()) host.send(IPC_CHANNELS.lookupStateChanged, this.state);
			}
		}
		if (view !== null && !view.webContents.isDestroyed()) view.webContents.close();
	}

	private Create(window: BrowserWindow): void
	{
		const isolatedSession = session.fromPartition("chora-dictionary");
		isolatedSession.setPermissionRequestHandler(function DenyPermission(_contents, _permission, callback): void { callback(false); });
		isolatedSession.setPermissionCheckHandler(function DenyPermissionCheck(): boolean { return false; });
		if (isolatedSession.listenerCount("will-download") === 0)
		{
			isolatedSession.on("will-download", function DenyDownload(event): void { event.preventDefault(); });
		}
		const view = new WebContentsView({ webPreferences: { session: isolatedSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, navigateOnDragDrop: false } });
		this.view = view;
		this.owner = window;
		view.setVisible(false);
		window.contentView.addChildView(view);
		window.on("closed", this.closeHandler);
		window.on("resize", this.resizeHandler);
		window.webContents.on("did-start-loading", this.closeHandler);
		view.webContents.setWindowOpenHandler(function DenyPopup(): { action: "deny" } { return { action: "deny" }; });
		view.webContents.on("will-navigate", this.CheckNavigation.bind(this));
		view.webContents.on("will-redirect", this.CheckNavigation.bind(this));
		view.webContents.on("will-frame-navigate", function CheckFrame(event): void
		{
			if (!LookupService.IsAllowedUrl(event.url)) event.preventDefault();
		});
		view.webContents.on("did-start-loading", this.HandleLoading.bind(this));
		view.webContents.on("did-stop-loading", this.HandleLoaded.bind(this));
		view.webContents.on("did-navigate", this.HandleLocation.bind(this));
		view.webContents.on("did-navigate-in-page", this.HandleInPageNavigation.bind(this));
		view.webContents.on("did-fail-load", this.HandleFailure.bind(this));
		view.webContents.on("render-process-gone", this.HandleProcessGone.bind(this));
	}

	private CheckNavigation(event: Event, url: string): void
	{
		if (!LookupService.IsAllowedUrl(url))
		{
			event.preventDefault();
			this.Fail("This link is outside Logeion. Open the dictionary in your browser to follow it.");
		}
	}

	private HandleLoading(): void
	{
		this.state = { ...this.state, loading: true };
		this.Publish();
	}

	private HandleLoaded(): void
	{
		const history = this.view?.webContents.navigationHistory;
		this.state = { ...this.state, loading: false, canGoBack: history?.canGoBack() ?? false, canGoForward: history?.canGoForward() ?? false };
		this.Publish();
	}

	private HandleInPageNavigation(_event: Event, _url: string, mainFrame: boolean): void
	{
		if (mainFrame)
		{
			const reload = this.historyNavigationPending;
			this.HandleLocation();
			if (reload)
			{
				this.HandleLoading();
				this.view?.webContents.reload();
			}
		}
	}

	private HandleLocation(): void
	{
		this.historyNavigationPending = false;
		const contents = this.view?.webContents;
		const url = contents?.getURL() ?? "";
		if (LookupService.IsAllowedUrl(url))
		{
			this.state = { ...this.state, url, canGoBack: contents?.navigationHistory.canGoBack() ?? false, canGoForward: contents?.navigationHistory.canGoForward() ?? false, error: null };
			this.Publish();
		}
	}

	private HandleFailure(_event: Event, code: number, _description: string, _url: string, mainFrame: boolean): void
	{
		if (mainFrame && code !== -3) this.Fail("Dictionary could not be loaded. Retry or open it in your browser.");
	}

	private HandleProcessGone(): void
	{
		this.Fail("Dictionary stopped responding. Retry or open it in your browser.");
		Errors.Error("LookupService", "Dictionary renderer exited.");
	}

	private Fail(message: string): void
	{
		this.state = { ...this.state, error: message, loading: false };
		this.Hide();
		this.Publish();
	}

	private Hide(): void
	{
		this.view?.setVisible(false);
	}

	private Publish(): void
	{
		if (this.owner !== null && !this.owner.isDestroyed() && !this.owner.webContents.isDestroyed())
		{
			this.owner.webContents.send(IPC_CHANNELS.lookupStateChanged, this.state);
		}
		this.SetBounds(this.bounds);
	}
}