import type { ModelSelection } from "../../shared/chat/ModelTypes.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import { ChatController } from "./ChatController.js";
import { ChatStore } from "./ChatStore.js";
import { EscapeHtml } from "../ui/Html.js";

export class ChatPanel
{
	private readonly subscriptions: Unsubscribe[] = [];
	public constructor(private readonly root: HTMLElement, private readonly events: ChoraEventBus<ChoraEvents>, private readonly store: ChatStore, private readonly controller: ChatController)
	{
		this.root.addEventListener("click", (event) => this.HandleClick(event));
		this.root.addEventListener("input", (event) => this.HandleInput(event));
		this.root.addEventListener("change", (event) => this.HandleChange(event));
		this.root.addEventListener("keydown", (event) => this.HandleKeyDown(event));
		this.root.addEventListener("submit", (event) => this.HandleSubmit(event));
		this.subscriptions.push(this.events.Subscribe("chat.changed", () => this.HandleChatChanged()));
		this.Update();
	}

	public Dispose(): void
	{
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
	}

	private Update(): void
	{
		const view = this.store.GetView();

		if (view === "catalogue")
		{
			this.RenderCatalogue();
		}
		else
		{
			this.RenderConversation();
		}
	}

	// Renders the durable conversation history and its new-conversation command.
	private RenderCatalogue(): void
	{
		const conversations = this.store.GetConversations();
		const items = conversations.map((conversation) => `<button class="chat-catalogue-item button-control" data-chat-open="${EscapeHtml(conversation.id)}" type="button"><strong>${EscapeHtml(conversation.title)}</strong><span>${EscapeHtml(this.FormatUpdatedAt(conversation.updatedAt))}</span></button>`).join("");
		const empty = conversations.length === 0 ? `<p class="chat-catalogue-empty">No conversations yet.</p>` : "";

		this.root.innerHTML = `<section class="chat-panel chat-catalogue left-tab-panel" aria-label="Chat history"><header class="chat-header"><h2>Chat</h2><button class="chat-header-button button-control" data-chat-new type="button" title="New conversation" aria-label="New conversation">+</button></header><div class="chat-catalogue-list">${items}${empty}</div></section>`;
	}

	// Renders the active conversation and its composer.
	private RenderConversation(): void
	{
		const status = this.store.GetStatus();
		const isBusy = status === "submitting" || status === "streaming";
		const messages = this.store.GetMessages().map((message) => `<article class="chat-message ${message.role} ${message.kind === "tool" ? "tool" : ""}">${message.kind === "tool" ? `<span class="tool-result-label">Tool result</span>` : ""}<div class="chat-text">${EscapeHtml(message.content)}</div></article>`).join("");
		const pendingText = status === "submitting" ? "Thinking…" : this.store.GetStreamText();
		const pending = isBusy ? `<article class="chat-message assistant pending" aria-live="polite"><div class="chat-text" data-chat-stream>${EscapeHtml(pendingText)}</div></article>` : "";
		const error = this.store.GetErrorMessage();
		const errorHtml = error === null ? "" : `<div class="chat-error">${EscapeHtml(error)}</div>`;
		const selection = this.store.GetModelSelection();
		const providers = this.store.GetProviderOptions().map((option) => `<option value="${option.providerId}" data-model-id="${EscapeHtml(option.modelId)}" ${option.providerId === selection.providerId && option.modelId === selection.modelId ? "selected" : ""}>${EscapeHtml(option.modelName)}</option>`).join("");
		const tools = this.store.GetTools().map((tool) => `<option value="${EscapeHtml(tool.name)}">${EscapeHtml(tool.label)}</option>`).join("");

		const title = this.GetConversationTitle();
		this.root.innerHTML = `<section class="chat-panel left-tab-panel" aria-label="Reading conversation" aria-busy="${isBusy}"><header class="chat-header chat-conversation-header"><button class="chat-header-button button-control" data-chat-back type="button" title="Back to conversations" aria-label="Back to conversations">&#8592;</button><h2>${EscapeHtml(title)}</h2><button class="chat-header-button button-control" data-chat-new type="button" title="New conversation" aria-label="New conversation" ${isBusy ? "disabled" : ""}>+</button></header><div class="chat-transcript" aria-live="polite">${messages}${pending}</div>${errorHtml}<form class="chat-form" data-chat-form><textarea data-chat-input rows="3" placeholder="Message the text..." ${isBusy ? "disabled" : ""}>${EscapeHtml(this.store.GetDraft())}</textarea><div class="chat-composer-footer"><div class="composer-spacer"></div><select data-chat-tool aria-label="Tools" ${this.store.GetTools().length === 0 ? "disabled" : ""}><option value="">Tools</option>${tools}</select><select data-chat-provider aria-label="Model" ${this.store.GetHasConversation() ? "disabled" : ""}>${providers}</select><button class="composer-button send-button button-control" type="submit" ${isBusy ? "disabled" : ""}>${isBusy ? "Waiting…" : "Send"}</button></div></form></section>`;
		const transcript = this.root.querySelector<HTMLElement>(".chat-transcript");
		if (transcript !== null) transcript.scrollTop = transcript.scrollHeight;
	}

	private HandleChatChanged(): void
	{
		const stream = this.root.querySelector<HTMLElement>("[data-chat-stream]");
		const status = this.store.GetStatus();

		if (stream !== null && status === "streaming")
		{
			stream.textContent = this.store.GetStreamText();
		}
		else
		{
			this.Update();
		}
	}

	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const openId = target?.closest<HTMLElement>("[data-chat-open]")?.dataset.chatOpen;
		const isNewConversation = target?.closest("[data-chat-new]") !== null;
		const isBack = target?.closest("[data-chat-back]") !== null;

		if (openId !== undefined)
		{
			void this.controller.OpenConversationAsync(openId);
		}

		if (isNewConversation)
		{
			this.controller.NewConversation();
		}

		if (isBack)
		{
			void this.controller.ShowCatalogueAsync();
		}
	}

	private HandleInput(event: Event): void
	{
		const target = event.target as HTMLTextAreaElement | null;
		if (target?.matches("[data-chat-input]") === true) this.controller.SetDraft(target.value);
	}

	private HandleChange(event: Event): void
	{
		const target = event.target as HTMLSelectElement | null;

		if (target?.matches("[data-chat-provider]") === true)
		{
			const selectedOption = target.selectedOptions.item(0);
			const modelId = selectedOption?.dataset.modelId ?? "";
			const selection: ModelSelection = {
				providerId: target.value as ModelSelection["providerId"],
				modelId
			};
			this.controller.SetModelSelection(selection);
		}
		if (target?.matches("[data-chat-tool]") === true && target.value.length > 0)
		{
			this.controller.SetDraft(`@${target.value} `);
			this.Update();
			this.root.querySelector<HTMLTextAreaElement>("[data-chat-input]")?.focus();
		}
	}

	private HandleSubmit(event: Event): void
	{
		const form = event.target as HTMLFormElement | null;

		if (form?.matches("[data-chat-form]") === true)
		{
			event.preventDefault();
			const message = this.store.GetDraft();
			void this.controller.SendAsync(message);
		}
	}

	private HandleKeyDown(event: KeyboardEvent): void
	{
		const target = event.target as HTMLElement | null;
		const shouldSend = target?.matches("[data-chat-input]") === true && event.key === "Enter" && (event.ctrlKey || event.metaKey);

		if (shouldSend)
		{
			event.preventDefault();
			const form = target?.closest<HTMLFormElement>("[data-chat-form]");
			form?.requestSubmit();
		}
	}

	// Returns the active conversation title when the conversation has been saved.
	private GetConversationTitle(): string
	{
		const conversationId = this.store.GetConversationId();
		const conversation = this.store.GetConversations().find((candidate) => candidate.id === conversationId);
		const title = conversation?.title ?? "New conversation";

		return title;
	}

	// Formats a compact local timestamp for the saved conversation history.
	private FormatUpdatedAt(value: string): string
	{
		const date = new Date(value);
		const formatted = Number.isNaN(date.valueOf()) ? "" : date.toLocaleString();

		return formatted;
	}
}
