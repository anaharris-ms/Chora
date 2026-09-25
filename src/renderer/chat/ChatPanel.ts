import type { ModelSelection } from "../../shared/chat/ModelTypes.js";
import type { ChoraEvents } from "../core/events/ChoraEvents.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/ChoraEventBus.js";
import { ChatController } from "./ChatController.js";
import { ChatStore } from "./ChatStore.js";
import { EscapeHtml } from "../ui/Html.js";
import { PopupPanel } from "../ui/PopupPanel.js";
import { createElement, Trash2 } from "lucide";

// Renders the Chat catalogue and conversation views and translates browser events into controller calls.
export class ChatPanel
{
	// Event-bus subscriptions released when the panel is disposed.
	private readonly subscriptions: Unsubscribe[] = [];
	// Uses an in-app confirmation so native dialogs cannot interrupt renderer input focus.
	private readonly modelPopup = new PopupPanel("Change model");
	// Model waiting for the reader to confirm a new conversation.
	private pendingModel: ModelSelection | null = null;
	// Confirms destructive actions without a native dialog.
	private readonly deletePopup = new PopupPanel("Delete chat");
	// Identity of the saved chat awaiting confirmation.
	private pendingDeletion: string | null = null;
	// Restores focus to the command that opened the confirmation when it still exists.
	private deleteTrigger: HTMLElement | null = null;

	// Wires up DOM and application-event listeners, then renders the initial view.
	public constructor(
		private readonly root: HTMLElement,
		private readonly events: ChoraEventBus<ChoraEvents>,
		private readonly store: ChatStore,
		private readonly controller: ChatController)
	{
		this.root.addEventListener("click", this.HandleClick.bind(this));
		this.root.addEventListener("input", this.HandleInput.bind(this));
		this.root.addEventListener("change", this.HandleChange.bind(this));
		this.root.addEventListener("keydown", this.HandleKeyDown.bind(this));
		this.root.addEventListener("submit", this.HandleSubmit.bind(this));
		this.modelPopup.OnBodyClick(this.HandleModelConfirmation.bind(this));
		this.deletePopup.OnBodyClick(this.HandleDeleteConfirmationAsync.bind(this));
		this.subscriptions.push(this.events.Subscribe("chat.changed", this.HandleChatChanged.bind(this)));
		this.Update();
	}

	// Releases event-bus subscriptions held by this panel.
	public Dispose(): void
	{
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
		this.modelPopup.Dispose();
		this.deletePopup.Dispose();
	}

	// Renders the catalogue or conversation view according to the current Chat view.
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
		const status = this.store.GetStatus();
		const blocked = status === "submitting" || status === "streaming" || this.store.GetIsDeleting();
		const buttons = this.root.querySelectorAll<HTMLButtonElement>("[data-chat-delete]");
		for (const button of Array.from(buttons))
		{
			button.disabled = blocked;
			const icon = createElement(Trash2);
			icon.setAttribute("aria-hidden", "true");
			button.append(icon);
		}
	}

	// Renders the durable conversation history and its new-conversation command.
	private RenderCatalogue(): void
	{
		const conversations = this.store.GetConversations();
		const items = conversations.map((conversation) => `<div class="chat-catalogue-row"><button class="chat-catalogue-item button-control" data-chat-open="${EscapeHtml(conversation.id)}" type="button"><strong>${EscapeHtml(conversation.title)}</strong><span>${EscapeHtml(this.FormatUpdatedAt(conversation.updatedAt))}</span></button><button class="chat-header-button chat-delete-button button-control" data-chat-delete="${EscapeHtml(conversation.id)}" type="button" title="Delete chat" aria-label="Delete chat: ${EscapeHtml(conversation.title)}"></button></div>`).join("");
		const empty = conversations.length === 0 ? `<p class="chat-catalogue-empty">No conversations yet.</p>` : "";

		this.root.innerHTML = `<section class="chat-panel chat-catalogue left-tab-panel" aria-label="Chat history"><header class="chat-header"><h2>Chat</h2><button class="chat-header-button button-control" data-chat-new type="button" title="New conversation" aria-label="New conversation">+</button></header><div class="chat-catalogue-list">${items}${empty}</div></section>`;
	}

	// Renders the active conversation and its composer.
	private RenderConversation(): void
	{
		const status = this.store.GetStatus();
		const isBusy = status === "submitting" || status === "streaming";
		const title = this.GetConversationTitle();
		const conversationId = this.store.GetConversationId();
		const deleteButton = conversationId === null ? "" : `<button class="chat-header-button chat-delete-button button-control" data-chat-delete="${EscapeHtml(conversationId)}" type="button" title="Delete chat" aria-label="Delete chat"></button>`;
		const header = `<header class="chat-header chat-conversation-header"><button class="chat-header-button button-control" data-chat-back type="button" title="Back to conversations" aria-label="Back to conversations">&#8592;</button><h2>${EscapeHtml(title)}</h2>${deleteButton}<button class="chat-header-button button-control" data-chat-new type="button" title="New conversation" aria-label="New conversation" ${isBusy ? "disabled" : ""}>+</button></header>`;
		const transcript = this.RenderTranscript(isBusy);
		const errorHtml = this.RenderChatError();
		const composer = this.RenderComposer(isBusy);
		const signal = this.store.GetSignalContext()?.dream.focusedSignal;
		const focus = signal === undefined ? "" : `<div class="chat-signal-focus" aria-label="Selected signal">${EscapeHtml(signal.text)}</div>`;
		const form = this.root.querySelector<HTMLFormElement>("[data-chat-form]");
		if (form === null)
		{
			this.root.innerHTML = `<section class="chat-panel left-tab-panel" aria-label="Reading conversation" aria-busy="${isBusy}">${header}${focus}${transcript}${errorHtml}${composer}</section>`;
		}
		else
		{
			const section = form.parentElement!;
			section.setAttribute("aria-busy", String(isBusy));
			while (section.firstElementChild !== form)
			{
				section.firstElementChild?.remove();
			}
			form.insertAdjacentHTML("beforebegin", `${header}${focus}${transcript}${errorHtml}`);
			const template = document.createElement("template");
			template.innerHTML = composer;
			const footer = template.content.querySelector(".chat-composer-footer")!;
			form.querySelector(".chat-composer-footer")?.replaceWith(footer);
			const input = form.querySelector<HTMLTextAreaElement>("[data-chat-input]")!;
			const draft = this.store.GetDraft();
			if (input.value !== draft)
			{
				input.value = draft;
			}
		}
		const transcriptElement = this.root.querySelector<HTMLElement>(".chat-transcript");
		if (transcriptElement !== null) transcriptElement.scrollTop = transcriptElement.scrollHeight;
	}

	// Renders the message history and any pending assistant response.
	private RenderTranscript(isBusy: boolean): string
	{
		const messages = this.store.GetMessages().map((message) => `<article class="chat-message ${message.role} ${message.kind === "tool" ? "tool" : ""}">${message.kind === "tool" ? `<span class="tool-result-label">Tool result</span>` : ""}<div class="chat-text">${EscapeHtml(message.content)}</div></article>`).join("");
		const status = this.store.GetStatus();
		const pendingText = status === "submitting" ? "Thinking…" : this.store.GetStreamText();
		const pending = isBusy ? `<article class="chat-message assistant pending" aria-live="polite"><div class="chat-text" data-chat-stream>${EscapeHtml(pendingText)}</div></article>` : "";
		const transcript = `<div class="chat-transcript" aria-live="polite">${messages}${pending}</div>`;
		return transcript;
	}

	// Renders the failure banner when a request could not complete.
	private RenderChatError(): string
	{
		const error = this.store.GetErrorMessage();
		const errorHtml = error === null ? "" : `<div class="chat-error">${EscapeHtml(error)}</div>`;
		return errorHtml;
	}

	// Renders the message composer with its tool and model selectors.
	private RenderComposer(isBusy: boolean): string
	{
		const selection = this.store.GetModelSelection();
		const providers = this.store.GetProviderOptions().map((option) => `<option value="${option.providerId}" data-model-id="${EscapeHtml(option.modelId)}" ${option.providerId === selection.providerId && option.modelId === selection.modelId ? "selected" : ""}>${EscapeHtml(option.modelName)}</option>`).join("");
		const tools = this.store.GetTools().map((tool) => `<option value="${EscapeHtml(tool.name)}">${EscapeHtml(tool.label)}</option>`).join("");
		const composer = `<form class="chat-form" data-chat-form><textarea data-chat-input rows="3" placeholder="Message the text...">${EscapeHtml(this.store.GetDraft())}</textarea><div class="chat-composer-footer"><div class="composer-spacer"></div><select data-chat-tool aria-label="Tools" ${this.store.GetTools().length === 0 ? "disabled" : ""}><option value="">Tools</option>${tools}</select><select data-chat-provider aria-label="Model" ${isBusy ? "disabled" : ""}>${providers}</select><button class="composer-button send-button button-control" type="submit" ${isBusy ? "disabled" : ""}>${isBusy ? "Waiting…" : "Send"}</button></div></form>`;
		return composer;
	}

	// Re-renders on a Chat change, or patches the streaming text in place to avoid a full redraw.
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

	// Routes catalogue clicks (open, new, back) to the matching controller workflow.
	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const openId = target?.closest<HTMLElement>("[data-chat-open]")?.dataset.chatOpen;
		const isNewConversation = target?.closest("[data-chat-new]") !== null;
		const isBack = target?.closest("[data-chat-back]") !== null;
		const deleteButton = target?.closest<HTMLElement>("[data-chat-delete]");
		const deleteId = deleteButton?.dataset.chatDelete;
		if (deleteId !== undefined && !this.store.GetIsDeleting())
		{
			this.pendingDeletion = deleteId;
			this.deleteTrigger = deleteButton ?? null;
			const conversations = this.store.GetConversations();
			const conversation = conversations.find(function MatchConversation(candidate): boolean
			{
				return candidate.id === deleteId;
			});
			const title = conversation?.title ?? this.GetConversationTitle();
			this.deletePopup.SetBodyHtml(`<p>Delete "${EscapeHtml(title)}"? This cannot be undone.</p><p data-chat-delete-error role="alert" hidden></p><div class="chat-delete-actions"><button class="button-control" data-chat-delete-cancel type="button">Cancel</button><button class="button-control" data-chat-delete-confirm type="button">Delete chat</button></div>`);
			this.deletePopup.Open();
			const cancel = document.querySelector<HTMLButtonElement>("[data-chat-delete-cancel]");
			cancel?.focus();
		}

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

	// Confirms deletion and keeps failures available for retry.
	private async HandleDeleteConfirmationAsync(event: MouseEvent): Promise<void>
	{
		const target = event.target as HTMLElement | null;
		const confirm = target?.closest<HTMLButtonElement>("[data-chat-delete-confirm]");
		const cancel = target?.closest("[data-chat-delete-cancel]");
		if (!this.store.GetIsDeleting())
		{
			if (cancel != null)
			{
				this.deletePopup.Close();
				this.pendingDeletion = null;
				this.RestoreDeleteFocus();
			}
			else if (confirm != null && this.pendingDeletion !== null)
			{
				confirm.disabled = true;
				const deleted = await this.controller.DeleteConversationAsync(this.pendingDeletion);
				if (deleted)
				{
					this.deletePopup.Close();
					this.pendingDeletion = null;
					this.RestoreDeleteFocus();
				}
				else
				{
					confirm.disabled = false;
					this.deletePopup.SetSectionHtml("[data-chat-delete-error]", "Unable to delete this chat. Wait for any reply to finish, then try again.");
					const error = document.querySelector<HTMLElement>("[data-chat-delete-error]");
					if (error !== null) error.hidden = false;
					confirm.focus();
				}
			}
		}
	}

	// Returns keyboard focus after cancellation or removal of a history row.
	private RestoreDeleteFocus(): void
	{
		const fallback = this.root.querySelector<HTMLElement>("[data-chat-input], [data-chat-open], [data-chat-new]");
		const target = this.deleteTrigger?.isConnected === true ? this.deleteTrigger : fallback;
		target?.focus({ preventScroll: true });
		this.deleteTrigger = null;
	}

	// Records composer text as the reader types.
	private HandleInput(event: Event): void
	{
		const target = event.target as HTMLTextAreaElement | null;
		if (target?.matches("[data-chat-input]") === true) this.controller.SetDraft(target.value);
	}

	// Applies a model selection or inserts a chosen tool mention into the composer.
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
			const current = this.store.GetModelSelection();
			const changed = current.providerId !== selection.providerId || current.modelId !== selection.modelId;
			if (changed)
			{
				if (!this.store.GetHasConversation())
				{
					this.controller.SetModelSelection(selection);
					const input = this.root.querySelector<HTMLTextAreaElement>("[data-chat-input]");
					input?.focus({ preventScroll: true });
				}
				else
				{
					this.pendingModel = selection;
					this.Update();
					this.modelPopup.SetBodyHtml(`<p>Start a new chat with this model? The current chat will stay in history. Your selected signal and unsent message will carry over.</p><button class="button-control" type="button" data-chat-model-cancel>Cancel</button><button class="button-control" type="button" data-chat-model-confirm>Start new chat</button>`);
					this.modelPopup.Open();
					const cancel = document.querySelector<HTMLButtonElement>("[data-chat-model-cancel]");
					cancel?.focus();
				}
			}
		}
		if (target?.matches("[data-chat-tool]") === true && target.value.length > 0)
		{
			this.controller.SetDraft(`@${target.value} `);
			this.Update();
			this.root.querySelector<HTMLTextAreaElement>("[data-chat-input]")?.focus();
		}
	}

	// Sends the composer draft when the reader submits the form.
	private HandleModelConfirmation(event: MouseEvent): void
	{
		const target = event.target as HTMLElement | null;
		const confirm = target?.closest("[data-chat-model-confirm]") != null;
		const cancel = target?.closest("[data-chat-model-cancel]") != null;
		if (confirm || cancel)
		{
			const selection = this.pendingModel;
			this.pendingModel = null;
			this.modelPopup.Close();
			if (confirm && selection !== null)
			{
				this.controller.SetModelSelection(selection);
			}
			const input = this.root.querySelector<HTMLTextAreaElement>("[data-chat-input]");
			input?.focus({ preventScroll: true });
		}
	}

	// Sends the composer draft when the reader submits the form.
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

	// Submits the composer form on Ctrl/Cmd+Enter from the message input.
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
