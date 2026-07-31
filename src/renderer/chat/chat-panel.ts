import type { ProviderId } from "../../shared/chat/model-types.js";
import type { DreamInteractionMode } from "../../shared/chat/chat-types.js";
import type { ChoraEvents } from "../core/events/chora-events.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/chora-event-bus.js";
import { ChatController } from "./chat-controller.js";
import { ChatStore } from "./chat-store.js";
import { EscapeHtml } from "../ui/html.js";

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
		const status = this.store.GetStatus();
		const isBusy = status === "submitting" || status === "streaming";
		const messages = this.store.GetMessages().map((message) => `<article class="chat-message ${message.role} ${message.kind === "tool" ? "tool" : ""}">${message.kind === "tool" ? `<span class="tool-result-label">Tool result</span>` : ""}<div class="chat-text">${EscapeHtml(message.content)}</div></article>`).join("");
		const pendingText = status === "submitting" ? "Thinking…" : this.store.GetStreamText();
		const pending = isBusy ? `<article class="chat-message assistant pending" aria-live="polite"><div class="chat-text" data-chat-stream>${EscapeHtml(pendingText)}</div></article>` : "";
		const error = this.store.GetErrorMessage();
		const errorHtml = error === null ? "" : `<div class="chat-error">${EscapeHtml(error)}</div>`;
		const providers = this.store.GetProviderOptions().map((option) => `<option value="${option.providerId}" ${option.providerId === this.store.GetProvider() ? "selected" : ""}>${EscapeHtml(option.modelName)}</option>`).join("");
		const tools = this.store.GetTools().map((tool) => `<option value="${EscapeHtml(tool.name)}">${EscapeHtml(tool.label)}</option>`).join("");
		const dreamMode = this.store.GetDreamInteractionMode();
		const dreamModes = this.store.GetIsDreamActive() ? `<select class="dream-interaction-select" data-dream-interaction aria-label="Dream interaction" title="Choose how the model meets this Dream" ${isBusy ? "disabled" : ""}><option value="ECHO"${dreamMode === "ECHO" ? " selected" : ""}>Echo</option><option value="NUDGE"${dreamMode === "NUDGE" ? " selected" : ""}>Socratic Nudge</option><option value="COUNTER_WEIGHT"${dreamMode === "COUNTER_WEIGHT" ? " selected" : ""}>Counter-Weight</option></select>` : "";

		this.root.innerHTML = `<section class="chat-panel" aria-label="Reading conversation" aria-busy="${isBusy}"><div class="chat-transcript" aria-live="polite">${messages}${pending}</div>${errorHtml}<form class="chat-form" data-chat-form><textarea data-chat-input rows="3" placeholder="Message the text..." ${isBusy ? "disabled" : ""}>${EscapeHtml(this.store.GetDraft())}</textarea><div class="chat-composer-footer"><button class="composer-button" data-chat-reset type="button" title="New conversation" aria-label="New conversation" ${isBusy ? "disabled" : ""}>+</button><div class="composer-spacer"></div><select data-chat-tool aria-label="Tools" ${this.store.GetTools().length === 0 ? "disabled" : ""}><option value="">Tools</option>${tools}</select><select data-chat-provider aria-label="Model" ${this.store.GetHasConversation() ? "disabled" : ""}>${providers}</select><button class="composer-button send-button" type="submit" ${isBusy ? "disabled" : ""}>${isBusy ? "Waiting…" : "Send"}</button></div></form></section>`;
		const form = this.root.querySelector<HTMLElement>("[data-chat-form]");
		if (form !== null && dreamModes.length > 0) form.insertAdjacentHTML("afterbegin", dreamModes);
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
		if (target?.closest("[data-chat-reset]") !== null) this.controller.Reset();
	}

	private HandleInput(event: Event): void
	{
		const target = event.target as HTMLTextAreaElement | null;
		if (target?.matches("[data-chat-input]") === true) this.controller.SetDraft(target.value);
	}

	private HandleChange(event: Event): void
	{
		const target = event.target as HTMLSelectElement | null;

		if (target?.matches("[data-chat-provider]") === true) this.controller.SetProvider(target.value as ProviderId);
		if (target?.matches("[data-dream-interaction]") === true) this.controller.SetDreamInteractionMode(target.value as DreamInteractionMode);
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
}
