import "../styles.css";
import { ErrorManager } from "../core/diagnostics/renderer-error-manager.js";
import { ChoraEventBus } from "../core/events/chora-event-bus.js";
import type { ChoraEvents } from "../core/events/chora-events.js";
import { ChatController } from "../chat/chat-controller.js";
import { ChatGateway } from "../chat/chat-gateway.js";
import { ChatStore } from "../chat/chat-store.js";
import { ReadingContextBuilder } from "../core/context/reading-context-builder.js";
import { LibraryController } from "../library/library-controller.js";
import { LibraryGateway } from "../library/library-gateway.js";
import { LibraryStore } from "../library/library-store.js";
import { DreamController } from "../dreams/dream-controller.js";
import { DreamGateway } from "../dreams/dream-gateway.js";
import { DreamStore } from "../dreams/dream-store.js";
import { ChatPanel } from "../chat/chat-panel.js";
import { DocumentPanel } from "../library/document-panel.js";
import { DreamPanel } from "../dreams/dream-panel.js";
import { SessionStore } from "../core/session/session-store.js";

export class ChoraApplication
{
	private readonly disposables: Array<{ Dispose(): void }> = [];
	private readonly externalSubscriptions: Array<() => void> = [];
	private readonly keyDownHandler = (event: KeyboardEvent): void => void this.HandleKeyDownAsync(event);
	private readonly focusHandler = (): void => this.HandleWindowFocus();
	private readonly blurHandler = (): void => void this.dreams.SaveAsync();
	private isDisposed = false;
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

	public constructor(private readonly root: HTMLElement)
	{
		this.events.SetErrorHandler((failure) =>
		{
			this.errors.Error("ChoraEventBus", `Subscriber failed while handling ${String(failure.eventName)}.`, failure.error);
		});
	}

	public async StartAsync(): Promise<void>
	{
		this.root.innerHTML = `<main class="shell"><aside class="left-panel" data-chat-panel></aside><section class="center-panel" data-document-panel></section><aside class="right-panel" data-dream-panel></aside></main><div class="application-error" data-error-output hidden></div>`;
		const chatRoot = this.RequireElement("[data-chat-panel]");
		const documentRoot = this.RequireElement("[data-document-panel]");
		const dreamRoot = this.RequireElement("[data-dream-panel]");
		this.disposables.push(new ChatPanel(chatRoot, this.events, this.chatStore, this.chat));
		this.disposables.push(new DocumentPanel(documentRoot, this.events, this.libraryStore, this.library));
		this.disposables.push(new DreamPanel(dreamRoot, this.events, this.dreamStore, this.dreams, this.libraryStore));
		this.RegisterApplicationEvents();
		await this.dreams.StartAsync();
		await this.chat.StartAsync();
		await this.library.StartAsync();
		this.errors.Info("ChoraApplication", "Application started.");
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
			window.removeEventListener("keydown", this.keyDownHandler);
		window.removeEventListener("focus", this.focusHandler);
		window.removeEventListener("blur", this.blurHandler);
			this.disposables.length = 0;
			this.externalSubscriptions.length = 0;
		}
	}

	private RegisterApplicationEvents(): void
	{
		this.events.Subscribe("dream.opened", () => this.SetDreamOpen(true));
		this.events.Subscribe("dream.closed", () => this.SetDreamOpen(false));
		this.events.Subscribe("error.reported", (error) => this.ShowError(error.userMessage ?? error.message));
		this.externalSubscriptions.push(this.libraryGateway.SubscribeToSelection((textId) => void this.library.OpenAsync(textId)));
		this.externalSubscriptions.push(this.libraryGateway.SubscribeToExternalText((text) => this.library.OpenExternal(text)));
		window.addEventListener("keydown", this.keyDownHandler);
		window.addEventListener("focus", this.focusHandler);
		window.addEventListener("blur", this.blurHandler);
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
