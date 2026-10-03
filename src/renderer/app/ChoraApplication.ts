import "../styles.css";
import { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { ChoraEventBus } from "../core/events/ChoraEventBus.js";
import type { ChoraEvents, ErrorRecord } from "../core/events/ChoraEvents.js";
import type { LibraryText } from "../../shared/library/LibraryTypes.js";
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
import { DreamPassagePanel } from "../dreams/DreamPassagePanel.js";
import { SessionStore } from "../core/session/SessionStore.js";
import { PatternController } from "../patterns/PatternController.js";
import { PatternGateway } from "../patterns/PatternGateway.js";
import { PatternPanel } from "../patterns/PatternPanel.js";
import { PatternStore } from "../patterns/PatternStore.js";
import { ReadingSettingsStore, type ReadingFont } from "../core/settings/ReadingSettingsStore.js";
import { LookupStore } from "../library/lookup/LookupStore.js";
import { LookupGateway } from "../library/lookup/LookupGateway.js";
import { LookupController } from "../library/lookup/LookupController.js";
import { LookupPanel } from "../library/lookup/LookupPanel.js";

type ResizablePane = "left" | "dream";

// Composes the renderer's features, wires the application shell, and owns its top-level DOM and window listeners.
export class ChoraApplication
{
	// Panels disposed when the application shuts down.
	private readonly disposables: Array<{ Dispose(): void }> = [];
	// Event-bus and gateway subscriptions released when the application shuts down.
	private readonly externalSubscriptions: Array<() => void> = [];
	// Bound window/root listeners, stored so the same reference can later be removed.
	private readonly keyDownHandler = (event: KeyboardEvent): void => void this.HandleKeyDownAsync(event);
	private readonly focusHandler = (): void => this.HandleWindowFocus();
	private readonly blurHandler = (): void => void this.dreams.SaveAsync();
	private readonly leftViewClickHandler = (event: Event): void => this.HandleLeftViewClick(event);
	private readonly settingsChangeHandler = (event: Event): void => this.HandleSettingsChange(event);
	private readonly panelResizePointerDownHandler = (event: PointerEvent): void => this.HandlePanelResizePointerDown(event);
	private readonly panelResizePointerMoveHandler = (event: PointerEvent): void => this.HandlePanelResizePointerMove(event);
	private readonly panelResizePointerUpHandler = (): void => this.StopPanelResize();
	// Which pane is being dragged, or null when no resize is in progress.
	private activeResizablePane: ResizablePane | null = null;
	// Pointer position and pane width captured when a resize drag begins.
	private resizeStartX = 0;
	private resizeStartWidth = 0;
	// Guards against disposing more than once.
	private isDisposed = false;
	// Guards against starting more than once.
	private isStarted = false;
	// Shared application event bus.
	private readonly events = new ChoraEventBus<ChoraEvents>();
	// Reports and logs application errors.
	private readonly errors = new ErrorManager(this.events);
	// Owns persisted session storage shared by Dream and Chat state.
	private readonly sessions = new SessionStore();
	// Library: catalogue/active-text state, IPC client, and workflow coordinator.
	private readonly libraryStore = new LibraryStore();
	private readonly libraryGateway = new LibraryGateway();
	private readonly library = new LibraryController(this.events, this.errors, this.libraryStore, this.libraryGateway);
	// Dreams: catalogue/active-Dream state, IPC client, and workflow coordinator.
	private readonly dreamStore = new DreamStore(this.sessions);
	private readonly dreamGateway = new DreamGateway();
	private readonly dreams = new DreamController(this.events, this.errors, this.libraryStore, this.dreamStore, this.dreamGateway);
	// Builds the reading context passed to the language model.
	private readonly contexts = new ReadingContextBuilder(this.libraryStore, this.dreamStore);
	// Chat: conversation state, IPC client, and workflow coordinator.
	private readonly chatStore = new ChatStore(this.sessions);
	private readonly chatGateway = new ChatGateway();
	private readonly chat = new ChatController(this.events, this.errors, this.contexts, this.chatStore, this.chatGateway);
	// Patterns: Hermeneia pattern state, IPC client, and workflow coordinator.
	private readonly patternStore = new PatternStore();
	private readonly patternGateway = new PatternGateway();
	private readonly patterns = new PatternController(this.events, this.patternStore, this.patternGateway, this.libraryStore);

	// Owns reading appearance and font settings.
	private readonly settings = new ReadingSettingsStore();
	private readonly lookupStore = new LookupStore();
	private readonly lookupGateway = new LookupGateway();
	private readonly lookup = new LookupController(this.events, this.lookupStore, this.lookupGateway, this.errors);

	// Creates the application and routes event-bus subscriber failures to the error manager.
	public constructor(private readonly root: HTMLElement)
	{
		this.events.SetErrorHandler((failure) =>
		{
			this.errors.Report("ChoraEventBus", failure.error, `Something went wrong while handling ${String(failure.eventName)}.`);
		});
	}

	// Renders the application shell, mounts its feature panels, and starts each feature's workflows.
	public async StartAsync(): Promise<void>
	{
		if (!this.isDisposed && !this.isStarted)
		{
			this.isStarted = true;
			this.settings.Apply();
			this.root.innerHTML = `<main class="shell"><aside class="left-panel"><nav class="workspace-views" aria-label="Workspace views"><button class="activity-button button-control selected" data-left-view="dreams" type="button" aria-pressed="true">Dreams</button><button class="activity-button button-control" data-left-view="chat" type="button" aria-pressed="false">Chat</button><button class="activity-button button-control" data-left-view="patterns" type="button" aria-pressed="false">Patterns</button></nav><div class="left-view" data-chat-panel hidden></div><div class="left-view" data-pattern-panel hidden></div><div class="left-view" data-dream-catalogue-panel></div></aside><section class="center-panel" data-document-panel></section><aside class="right-panel" data-dream-panel hidden></aside><div class="panel-resize-handle" data-resize-pane="left" role="separator" aria-label="Resize left workspace" aria-orientation="vertical"></div><div class="panel-resize-handle" data-resize-pane="dream" role="separator" aria-label="Resize Dream editor" aria-orientation="vertical"></div></main><div class="application-error" data-error-output hidden></div>`;
			const chatRoot = this.RequireElement("[data-chat-panel]");
			const readerColumn = this.RequireElement("[data-document-panel]");
			readerColumn.removeAttribute("data-document-panel");
			readerColumn.innerHTML = `<div class="reader-workspace"><section class="document-panel" data-document-panel></section><section data-lookup-panel aria-label="Dictionary" hidden></section></div>`;
			const patternRoot = this.RequireElement("[data-pattern-panel]");
			const dreamCatalogueRoot = this.RequireElement("[data-dream-catalogue-panel]");
			const documentRoot = this.RequireElement("[data-document-panel]");
			const dreamRoot = this.RequireElement("[data-dream-panel]");
			const lookupRoot = this.RequireElement("[data-lookup-panel]");
			this.disposables.push(new LookupPanel(lookupRoot, this.events, this.lookupStore, this.lookup));
			this.disposables.push(new ChatPanel(chatRoot, this.events, this.chatStore, this.chat));
			this.disposables.push(new PatternPanel(patternRoot, this.events, this.patternStore, this.patterns));
			this.disposables.push(new DocumentPanel(documentRoot, this.events, this.libraryStore, this.library, this.settings));
			const passagePanel = new DreamPassagePanel(documentRoot, this.events, this.libraryStore, this.dreams);
			this.disposables.push(passagePanel);
			this.disposables.push(new DreamPanel(dreamCatalogueRoot, this.events, this.dreamStore, this.dreams, this.libraryStore, "catalogue"));
			this.disposables.push(new DreamPanel(dreamRoot, this.events, this.dreamStore, this.dreams, this.libraryStore, "editor"));
			this.root.addEventListener("click", this.leftViewClickHandler);
			this.root.addEventListener("change", this.settingsChangeHandler);
			this.root.addEventListener("pointerdown", this.panelResizePointerDownHandler);
			this.RegisterApplicationEvents();
			await this.lookup.StartAsync();
			await this.dreams.StartAsync();
			await this.chat.StartAsync();
			await this.library.StartAsync();
			this.errors.Info("ChoraApplication", "Application started.");
		}
	}

	// Disposes feature panels and releases every listener and subscription registered by this application.
	public Dispose(): void
	{
		if (!this.isDisposed)
		{
			this.isDisposed = true;
			for (const disposable of this.disposables) disposable.Dispose();
			for (const unsubscribe of this.externalSubscriptions) unsubscribe();
			this.lookup.Dispose();
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
		const dreamOpened = this.events.Subscribe("dream.opened", this.HandleDreamOpened.bind(this));
		const chatConversationOpened = this.events.Subscribe("chat.conversation-opened", this.HandleChatConversationOpened.bind(this));
		this.externalSubscriptions.push(chatConversationOpened);
		const dreamClosed = this.events.Subscribe("dream.closed", this.HandleDreamClosed.bind(this));
		const passageFiltered = this.events.Subscribe("dream.passage-filter-changed", this.HandlePassageFilterChanged.bind(this));
		this.externalSubscriptions.push(passageFiltered);
		const errorReported = this.events.Subscribe("error.reported", this.HandleErrorReported.bind(this));
		const textOpened = this.events.Subscribe("library.text-opened", this.HandleTextOpened.bind(this));
		const focusChanged = this.events.Subscribe("library.focus-changed", this.HandleFocusChanged.bind(this));
		this.externalSubscriptions.push(dreamOpened, dreamClosed, errorReported, textOpened, focusChanged);
		this.externalSubscriptions.push(this.libraryGateway.SubscribeToSelection(this.HandleTextSelected.bind(this)));
		this.externalSubscriptions.push(this.libraryGateway.SubscribeToExternalText(this.HandleExternalTextLoaded.bind(this)));
		window.addEventListener("keydown", this.keyDownHandler);
		window.addEventListener("focus", this.focusHandler);
		window.addEventListener("blur", this.blurHandler);
	}

	// Reveals the active conversation and focuses its composer without scrolling the reading pane.
	private HandleChatConversationOpened(): void
	{
		this.SetLeftView("chat");
		const composer = this.root.querySelector<HTMLTextAreaElement>("[data-chat-input]");
		composer?.focus({ preventScroll: true });
	}

	// Reveals the Dream editor when a Dream is opened.
	private HandleDreamOpened(): void
	{
		this.SetDreamOpen(true);
		this.SetLeftView("dreams");
	}

	// Reveals passage-filtered Dreams without opening an editor or navigating the text.
	private HandlePassageFilterChanged(): void
	{
		const filter = this.dreamStore.GetPassageFilter();
		if (filter !== null)
		{
			this.SetLeftView("dreams");
		}
	}

	// Hides the Dream editor when the active Dream is closed.
	private HandleDreamClosed(): void
	{
		this.SetDreamOpen(false);
	}

	// Surfaces a reported error in the application error banner.
	private HandleErrorReported(error: ErrorRecord): void
	{
		this.ShowError(error.userMessage ?? error.message);
	}

	// Loads external patterns after a Library text establishes their document identity.
	private async HandleTextOpened(): Promise<void>
	{
		const text = this.libraryStore.GetText();
		if (text !== null)
		{
			this.patterns.SetDocumentId(text.id);
			await this.patterns.LoadAsync(text.id);
		}
	}

	// Opens a text selected in the main process's application menu or dock.
	private HandleTextSelected(textId: string): void
	{
		void this.library.OpenAsync(textId);
	}

	// Opens a text the main process loaded outside the Library catalogue lookup.
	private HandleExternalTextLoaded(text: LibraryText): void
	{
		this.library.OpenExternal(text);
	}

	// Refreshes the active Dream from disk when the window regains focus, in case it changed externally.
	private HandleWindowFocus(): void
	{
		if (this.dreamStore.GetActiveDream() === null) void this.dreams.RefreshAsync();
	}

	// Displays a message in the application-wide error banner.
	private ShowError(message: string): void
	{
		const output = this.root.querySelector<HTMLElement>("[data-error-output]");

		if (output !== null)
		{
			output.textContent = message;
			output.hidden = false;
		}
	}

	// Shows or hides the Dream editor pane.
	private SetDreamOpen(isOpen: boolean): void
	{
		this.root.querySelector(".shell")?.classList.toggle("dream-open", isOpen);
		this.root.querySelector<HTMLElement>("[data-dream-panel]")?.toggleAttribute("hidden", !isOpen);
	}

	// Begins tracking a pane-resize drag started from a resize handle.
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

	// Resizes the dragged pane, clamped so both the reader and the other pane stay usable.
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
				if (width < 140)
				{
					this.CollapseLeftPane(shell);
				}
				else
				{
					shell.classList.remove("left-collapsed");
					const maximumWidth = shellWidth - minimumReaderWidth - (isDreamOpen ? 300 : 0);
					const clampedWidth = Math.max(220, Math.min(width, maximumWidth));
					shell.style.setProperty("--left-pane-width", `${clampedWidth}px`);
				}
			}
			else
			{
				const maximumWidth = shellWidth - leftWidth - minimumReaderWidth;
				width = Math.max(300, Math.min(width, maximumWidth));
				shell.style.setProperty("--dream-pane-width", `${width}px`);
			}
		}
	}

	// Leaves workspace navigation accessible when the left pane is collapsed.
	private CollapseLeftPane(shell: HTMLElement): void
	{
		shell.style.setProperty("--left-collapsed-width", "90px");
		shell.classList.add("left-collapsed");
	}

	// Ends a pane-resize drag and releases its pointer listeners.
	private StopPanelResize(): void
	{
		const shell = this.root.querySelector<HTMLElement>(".shell");
		this.activeResizablePane = null;
		window.removeEventListener("pointermove", this.panelResizePointerMoveHandler);
		window.removeEventListener("pointerup", this.panelResizePointerUpHandler);
		shell?.classList.remove("is-resizing");
	}

	// Routes clicks on the activity rail, font stepper, and appearance toggle to their workflows.
	private HandleLeftViewClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const appearanceButton = target?.closest<HTMLElement>("[data-toggle-appearance]");
		const fontStep = target?.closest<HTMLElement>("[data-font-size]")?.dataset.fontSize;
		const view = target?.closest<HTMLElement>("[data-left-view]")?.dataset.leftView;

		if (appearanceButton != null)
		{
			this.ToggleAppearance();
		}

		if (fontStep !== undefined)
		{
			this.ChangeFontSize(Number.parseInt(fontStep, 10));
		}

		if (view === "chat" || view === "patterns" || view === "dreams")
		{
			this.root.querySelector(".shell")?.classList.remove("left-collapsed");
			this.SetLeftView(view);
			const menu = target?.closest<HTMLDetailsElement>(".action-menu");
			if (menu !== null && menu !== undefined) menu.open = false;
		}
	}

	// Applies a change to the reading-font selector.
	private HandleSettingsChange(event: Event): void
	{
		const target = event.target as HTMLSelectElement | null;

		if (target?.matches("[data-reading-font]") === true)
		{
			this.settings.SetFont(target.value as ReadingFont);
		}
	}

	// Shows the requested left view and hides the others.
	private SetLeftView(view: "chat" | "patterns" | "dreams"): void
	{
		const chatView = this.root.querySelector<HTMLElement>("[data-chat-panel]");
		const patternView = this.root.querySelector<HTMLElement>("[data-pattern-panel]");
		const dreamView = this.root.querySelector<HTMLElement>("[data-dream-catalogue-panel]");
		const buttons = this.root.querySelectorAll<HTMLElement>(".activity-button[data-left-view]");
		chatView?.toggleAttribute("hidden", view !== "chat");
		patternView?.toggleAttribute("hidden", view !== "patterns");
		dreamView?.toggleAttribute("hidden", view !== "dreams");
		for (const button of Array.from(buttons))
		{
			const selected = button.dataset.leftView === view;
			button.classList.toggle("selected", selected);
			button.setAttribute("aria-pressed", String(selected));
		}
	}

	// Applies a font-size step and reflects the new value in the toolbar.
	private ChangeFontSize(delta: number): void
	{
		this.settings.ChangeFontSize(delta);
		const value = this.root.querySelector<HTMLElement>("[data-font-size-value]");
		if (value !== null) value.textContent = String(this.settings.GetFontSize());
	}

	// Toggles light/dark appearance and reflects the new state on the toggle button.
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

	// Updates the pattern scope when the reader's focused segment changes.
	private HandleFocusChanged(event: ChoraEvents["library.focus-changed"]): void
	{
		const document = this.libraryStore.GetText();
		const segment = document?.segments.find((candidate) => candidate.key === event.segmentKey);
		const locator = segment?.locator?.value ?? null;
		this.patterns.SetFocusedLocator(locator);
	}

	// Handles the Dream-creation and Dream-save keyboard shortcuts.
	private async HandleKeyDownAsync(event: KeyboardEvent): Promise<void>
	{
		const hasCommandModifier = event.ctrlKey || event.metaKey;
		const target = event.target as HTMLElement | null;
		const isEditable = target?.matches("input, textarea, [contenteditable=true]") ?? false;
		if (event.key === "Escape")
		{
			const nodes = this.root.querySelectorAll<HTMLDetailsElement>(".action-menu[open]");
			const menus = Array.from(nodes);
			for (const menu of menus)
			{
				menu.open = false;
				menu.querySelector<HTMLElement>("summary")?.focus();
			}
		}

		if (hasCommandModifier && event.key.toLowerCase() === "d" && !isEditable)
		{
			const selection = this.libraryStore.GetSelection();
			if (selection !== null) await this.dreams.Create(selection);
		}

		if (hasCommandModifier && event.key === "Enter" && this.dreamStore.GetActiveDream() !== null)
		{
			event.preventDefault();
			await this.dreams.SaveAsync();
		}
	}

	// Returns a required root element, throwing when the application markup is missing it.
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
