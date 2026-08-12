import "../styles.css";
import { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../core/events/ChoraEventBus.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChatController } from "../chat/ChatController.js";
import { ChatGateway } from "../chat/ChatGateway.js";
import { ChatStore } from "../chat/ChatStore.js";
import { ReadingContextBuilder } from "../core/context/ReadingContextBuilder.js";
import { LibraryController } from "../library/LibraryController.js";
import { LibraryGateway } from "../library/LibraryGateway.js";
import { LibraryStore } from "../library/LibraryStore.js";
import { DreamController } from "../dreams/DreamController.js";
import { DreamGateway } from "../dreams/DreamGateway.js";
import { DreamStore } from "../dreams/DreamStore.js";
import { ChatPanel } from "../chat/ChatPanel.js";
import { DocumentPanel } from "../library/DocumentPanel.js";
import { DreamPanel } from "../dreams/DreamPanel.js";
import { SessionStore } from "../core/session/SessionStore.js";
import { PatternController } from "../patterns/PatternController.js";
import { PatternGateway } from "../patterns/PatternGateway.js";
import { PatternPanel } from "../patterns/PatternPanel.js";
import { PatternStore } from "../patterns/PatternStore.js";
import { ReadingSettingsStore, type ReadingFont } from "../core/settings/ReadingSettingsStore.js";

type ResizablePane = "left" | "dream";

export class ChoraApplication
{
	private readonly disposables: Array<{ Dispose(): void }> = [];
	private readonly externalSubscriptions: Array<() => void> = [];
	private readonly keyDownHandler = (event: KeyboardEvent): void => void this.HandleKeyDownAsync(event);
	private readonly focusHandler = (): void => this.HandleWindowFocus();
	private readonly blurHandler = (): void => void this.dreams.SaveAsync();
	private readonly leftViewClickHandler = (event: Event): void => this.HandleLeftViewClick(event);
	private readonly settingsChangeHandler = (event: Event): void => this.HandleSettingsChange(event);
	private readonly panelResizePointerDownHandler = (event: PointerEvent): void => this.HandlePanelResizePointerDown(event);
	private readonly panelResizePointerMoveHandler = (event: PointerEvent): void => this.HandlePanelResizePointerMove(event);
	private readonly panelResizePointerUpHandler = (): void => this.StopPanelResize();
	private activeResizablePane: ResizablePane | null = null;
	private resizeStartX = 0;
	private resizeStartWidth = 0;
	private isDisposed = false;
	private isStarted = false;
	private readonly events = new ChoraEventBus<ChoraEvents>();
	private readonly errors = new ErrorManager(this.events);
	private readonly sessions = new SessionStore();
	private readonly libraryStore = new LibraryStore();
	private readonly libraryGateway = new LibraryGateway();
	private readonly library = new LibraryController(this.events, this.errors, this.libraryStore, this.libraryGateway);
	private readonly dreamStore = new DreamStore(this.sessions);
	private readonly dreamGateway = new DreamGateway();
	private readonly dreams = new DreamController(this.events, this.errors, this.libraryStore, this.dreamStore, this.dreamGateway);
	private readonly contexts = new ReadingContextBuilder(this.libraryStore, this.dreamStore);
	private readonly chatStore = new ChatStore(this.sessions);
	private readonly chatGateway = new ChatGateway();
	private readonly chat = new ChatController(this.events, this.errors, this.contexts, this.chatStore, this.chatGateway);
	private readonly patternStore = new PatternStore();
	private readonly patternGateway = new PatternGateway();
	private readonly patterns = new PatternController(this.events, this.patternStore, this.patternGateway);
	private patternPanel: PatternPanel | null = null;
	private readonly settings = new ReadingSettingsStore();

	public constructor(private readonly root: HTMLElement)
	{
		this.events.SetErrorHandler((failure) =>
		{
			this.errors.Error("ChoraEventBus", `Subscriber failed while handling ${String(failure.eventName)}.`, failure.error);
		});
	}

	public async StartAsync(): Promise<void>
	{
		if (!this.isDisposed && !this.isStarted)
		{
			this.isStarted = true;
			this.settings.Apply();
			const appearanceIcon = this.settings.GetAppearance() === "light" ? "&#9790;" : "&#9788;";
			const appearanceLabel = this.settings.GetAppearance() === "light" ? "Use dark appearance" : "Use light appearance";
			const fontSize = this.settings.GetFontSize();
			const font = this.settings.GetFont();
			const settingsMarkup = `<div class="app-settings"><div class="app-setting-stepper"><button class="app-setting-button button-control" data-font-size="-1" type="button" title="Decrease text size" aria-label="Decrease text size">A&minus;</button><span class="app-setting-value" data-font-size-value>${fontSize}</span><button class="app-setting-button button-control" data-font-size="1" type="button" title="Increase text size" aria-label="Increase text size">A+</button></div><label class="app-setting-field">Font<select class="app-setting-select" data-reading-font aria-label="Reading font"><option value="serif"${font === "serif" ? " selected" : ""}>Serif</option><option value="sans"${font === "sans" ? " selected" : ""}>Sans</option></select></label><button class="app-setting-button button-control" data-toggle-appearance type="button" title="${appearanceLabel}" aria-label="${appearanceLabel}">${appearanceIcon}</button></div>`;
			this.root.innerHTML = `<header class="application-toolbar"><div class="application-work-title">Chora <span>Republic</span></div>${settingsMarkup}</header><main class="shell"><aside class="left-panel"><nav class="activity-rail" aria-label="Left panel views"><button class="activity-button button-control selected" data-left-view="chat" type="button" title="Chat" aria-label="Chat">&#9673;</button><button class="activity-button button-control" data-left-view="patterns" type="button" title="Patterns" aria-label="Patterns">&#9678;</button><button class="activity-button button-control" data-left-view="dreams" type="button" title="Dreams" aria-label="Dreams">&#10022;</button></nav><div class="left-view" data-chat-panel></div><div class="left-view" data-pattern-panel hidden></div><div class="left-view" data-dream-catalogue-panel hidden></div></aside><section class="center-panel" data-document-panel></section><aside class="right-panel" data-dream-panel hidden></aside><div class="panel-resize-handle" data-resize-pane="left" role="separator" aria-label="Resize left workspace" aria-orientation="vertical"></div><div class="panel-resize-handle" data-resize-pane="dream" role="separator" aria-label="Resize Dream editor" aria-orientation="vertical"></div></main><div class="application-error" data-error-output hidden></div>`;
			const chatRoot = this.RequireElement("[data-chat-panel]");
			const patternRoot = this.RequireElement("[data-pattern-panel]");
			const dreamCatalogueRoot = this.RequireElement("[data-dream-catalogue-panel]");
			const documentRoot = this.RequireElement("[data-document-panel]");
			const dreamRoot = this.RequireElement("[data-dream-panel]");
			this.disposables.push(new ChatPanel(chatRoot, this.events, this.chatStore, this.chat));
			this.patternPanel = new PatternPanel(patternRoot, this.patternStore, this.patterns);
			this.patternPanel.Update();
			this.disposables.push(new DocumentPanel(documentRoot, this.events, this.libraryStore, this.library));
			this.disposables.push(new DreamPanel(dreamCatalogueRoot, this.events, this.dreamStore, this.dreams, this.libraryStore, "catalogue"));
			this.disposables.push(new DreamPanel(dreamRoot, this.events, this.dreamStore, this.dreams, this.libraryStore, "editor"));
			this.root.addEventListener("click", this.leftViewClickHandler);
			this.root.addEventListener("change", this.settingsChangeHandler);
			this.root.addEventListener("pointerdown", this.panelResizePointerDownHandler);
			this.RegisterApplicationEvents();
			await this.dreams.StartAsync();
			await this.chat.StartAsync();
			await this.library.StartAsync();
			this.errors.Info("ChoraApplication", "Application started.");
		}
	}

	public Dispose(): void
	{
		if (!this.isDisposed)
		{
			this.isDisposed = true;
			for (const disposable of this.disposables) disposable.Dispose();
			for (const unsubscribe of this.externalSubscriptions) unsubscribe();
			this.chat.Dispose();
			this.dreamStore.Dispose();
			this.root.removeEventListener("click", this.leftViewClickHandler);
			this.root.removeEventListener("change", this.settingsChangeHandler);
			this.root.removeEventListener("pointerdown", this.panelResizePointerDownHandler);
			window.removeEventListener("pointermove", this.panelResizePointerMoveHandler);
			window.removeEventListener("pointerup", this.panelResizePointerUpHandler);
			window.removeEventListener("keydown", this.keyDownHandler);
			window.removeEventListener("focus", this.focusHandler);
			window.removeEventListener("blur", this.blurHandler);
			this.disposables.length = 0;
			this.externalSubscriptions.length = 0;
		}
	}

	private RegisterApplicationEvents(): void
	{
		const dreamOpened = this.events.Subscribe("dream.opened", () =>
		{
			this.SetDreamOpen(true);
			this.SetLeftView("dreams");
		});
		const dreamClosed = this.events.Subscribe("dream.closed", () => this.SetDreamOpen(false));
		const errorReported = this.events.Subscribe("error.reported", (error) => this.ShowError(error.userMessage ?? error.message));
		const textOpened = this.events.Subscribe("library.text-opened", async (event) => await this.HandleLibraryTextOpenedAsync(event.text));
		const focusChanged = this.events.Subscribe("library.focus-changed", (event) => this.HandleLibraryFocusChanged(event.segmentKey));
		this.externalSubscriptions.push(dreamOpened, dreamClosed, errorReported, textOpened, focusChanged);
		this.externalSubscriptions.push(this.libraryGateway.SubscribeToSelection((textId) => void this.library.OpenAsync(textId)));
		this.externalSubscriptions.push(this.libraryGateway.SubscribeToExternalText((text) => this.library.OpenExternal(text)));
		window.addEventListener("keydown", this.keyDownHandler);
		window.addEventListener("focus", this.focusHandler);
		window.addEventListener("blur", this.blurHandler);
	}

	// Loads external patterns after a Library text establishes their document identity.
	private async HandleLibraryTextOpenedAsync(text: import("../../shared/library/LibraryTypes.js").LibraryText): Promise<void>
	{
		this.patterns.SetDocumentId(text.id);
		await this.patterns.LoadAsync(text.id);
		this.patternPanel?.SetDocument(text);
		this.patternPanel?.Update();
	}

	private HandleWindowFocus(): void
	{
		if (this.dreamStore.GetActiveDream() === null) void this.dreams.RefreshAsync();
	}

	private ShowError(message: string): void
	{
		const output = this.root.querySelector<HTMLElement>("[data-error-output]");

		if (output !== null)
		{
			output.textContent = message;
			output.hidden = false;
		}
	}

	private SetDreamOpen(isOpen: boolean): void
	{
		this.root.querySelector(".shell")?.classList.toggle("dream-open", isOpen);
		this.root.querySelector<HTMLElement>("[data-dream-panel]")?.toggleAttribute("hidden", !isOpen);
	}

	private HandlePanelResizePointerDown(event: PointerEvent): void
	{
		const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-resize-pane]");
		const pane = handle?.dataset.resizePane;
		const shell = this.root.querySelector<HTMLElement>(".shell");
		const panel = pane === "left" ? this.root.querySelector<HTMLElement>(".left-panel") : this.root.querySelector<HTMLElement>(".right-panel");

		if ((pane === "left" || pane === "dream") && shell !== null && panel !== null)
		{
			event.preventDefault();
			this.activeResizablePane = pane;
			this.resizeStartX = event.clientX;
			this.resizeStartWidth = panel.getBoundingClientRect().width;
			shell.classList.add("is-resizing");
			window.addEventListener("pointermove", this.panelResizePointerMoveHandler);
			window.addEventListener("pointerup", this.panelResizePointerUpHandler, { once: true });
		}
	}

	private HandlePanelResizePointerMove(event: PointerEvent): void
	{
		const shell = this.root.querySelector<HTMLElement>(".shell");
		const leftPanel = this.root.querySelector<HTMLElement>(".left-panel");

		if (shell !== null && leftPanel !== null && this.activeResizablePane !== null)
		{
			const shellWidth = shell.getBoundingClientRect().width;
			const delta = event.clientX - this.resizeStartX;
			const leftWidth = leftPanel.getBoundingClientRect().width;
			const isDreamOpen = shell.classList.contains("dream-open");
			const minimumReaderWidth = 320;
			let width = this.resizeStartWidth + delta;

			if (this.activeResizablePane === "left")
			{
				const maximumWidth = shellWidth - minimumReaderWidth - (isDreamOpen ? 300 : 0);
				width = Math.max(220, Math.min(width, maximumWidth));
				shell.style.setProperty("--left-pane-width", `${width}px`);
			}
			else
			{
				const maximumWidth = shellWidth - leftWidth - minimumReaderWidth;
				width = Math.max(300, Math.min(width, maximumWidth));
				shell.style.setProperty("--dream-pane-width", `${width}px`);
			}
		}
	}

	private StopPanelResize(): void
	{
		const shell = this.root.querySelector<HTMLElement>(".shell");
		this.activeResizablePane = null;
		window.removeEventListener("pointermove", this.panelResizePointerMoveHandler);
		window.removeEventListener("pointerup", this.panelResizePointerUpHandler);
		shell?.classList.remove("is-resizing");
	}

	private HandleLeftViewClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const appearanceButton = target?.closest<HTMLElement>("[data-toggle-appearance]");
		const fontStep = target?.closest<HTMLElement>("[data-font-size]")?.dataset.fontSize;
		const view = target?.closest<HTMLElement>("[data-left-view]")?.dataset.leftView;

		if (appearanceButton !== null)
		{
			this.ToggleAppearance();
		}

		if (fontStep !== undefined)
		{
			this.ChangeFontSize(Number.parseInt(fontStep, 10));
		}

		if (view === "chat" || view === "patterns" || view === "dreams")
		{
			this.SetLeftView(view);
		}
	}

	private HandleSettingsChange(event: Event): void
	{
		const target = event.target as HTMLSelectElement | null;

		if (target?.matches("[data-reading-font]") === true)
		{
			this.settings.SetFont(target.value as ReadingFont);
		}
	}

	private SetLeftView(view: "chat" | "patterns" | "dreams"): void
	{
		const chatView = this.root.querySelector<HTMLElement>("[data-chat-panel]");
		const patternView = this.root.querySelector<HTMLElement>("[data-pattern-panel]");
		const dreamView = this.root.querySelector<HTMLElement>("[data-dream-catalogue-panel]");
		const buttons = this.root.querySelectorAll<HTMLElement>(".activity-button[data-left-view]");
		chatView?.toggleAttribute("hidden", view !== "chat");
		patternView?.toggleAttribute("hidden", view !== "patterns");
		dreamView?.toggleAttribute("hidden", view !== "dreams");
		buttons.forEach((button) => button.classList.toggle("selected", button.dataset.leftView === view));
	}

	private ChangeFontSize(delta: number): void
	{
		this.settings.ChangeFontSize(delta);
		const value = this.root.querySelector<HTMLElement>("[data-font-size-value]");
		if (value !== null) value.textContent = String(this.settings.GetFontSize());
	}

	private ToggleAppearance(): void
	{
		this.settings.ToggleAppearance();
		const button = this.root.querySelector<HTMLElement>("[data-toggle-appearance]");
		const isLight = this.settings.GetAppearance() === "light";
		const label = isLight ? "Use dark appearance" : "Use light appearance";

		if (button !== null)
		{
			button.innerHTML = isLight ? "&#9790;" : "&#9788;";
			button.title = label;
			button.setAttribute("aria-label", label);
		}
	}

	private HandleLibraryFocusChanged(segmentKey: string): void
	{
		const document = this.libraryStore.GetText();
		const segment = document?.segments.find((candidate) => candidate.key === segmentKey);
		const locator = segment?.locator?.value ?? null;
		this.patterns.SetFocusedLocator(locator);
		this.patternPanel?.Update();
	}

	private async HandleKeyDownAsync(event: KeyboardEvent): Promise<void>
	{
		const hasCommandModifier = event.ctrlKey || event.metaKey;
		const target = event.target as HTMLElement | null;
		const isEditable = target?.matches("input, textarea, [contenteditable=true]") ?? false;

		if (hasCommandModifier && event.key.toLowerCase() === "d" && !isEditable)
		{
			const selection = this.libraryStore.GetSelection();
			if (selection !== null) this.dreams.Create(selection);
		}

		if (hasCommandModifier && event.key === "Enter" && this.dreamStore.GetActiveDream() !== null)
		{
			event.preventDefault();
			await this.dreams.SaveAsync();
		}
	}

	private RequireElement(selector: string): HTMLElement
	{
		const element = this.root.querySelector<HTMLElement>(selector);

		if (element === null) throw new Error(`Application element not found: ${selector}`);

		return element;
	}
}

window.addEventListener("DOMContentLoaded", () =>
{
	const root = document.getElementById("app");

	if (root !== null)
	{
		const application = new ChoraApplication(root);
		window.addEventListener("beforeunload", () => application.Dispose(), { once: true });
		void application.StartAsync();
	}
});
