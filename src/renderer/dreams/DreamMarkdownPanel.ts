import { Copy, Pencil, Save, X, createElement, type IconNode } from "lucide";
import { TabPanel } from "../ui/TabPanel.js";
import { MarkdownEditor } from "../ui/MarkdownEditor.js";
import type { DreamController } from "./DreamController.js";
import type { DreamStore } from "./DreamStore.js";
import type { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";

export class DreamMarkdownPanel extends TabPanel
{
	private readonly preview: MarkdownEditor;
	private readonly input = document.createElement("textarea");
	private readonly error = document.createElement("p");
	private readonly buttons = new Map<string, HTMLButtonElement>();
	private readonly clickHandler = this.HandleClickAsync.bind(this);
	private readonly inputHandler = this.HandleInput.bind(this);
	private busy = false;

	public constructor(private readonly controller: DreamController, private readonly store: DreamStore, private readonly errors: ErrorManager)
	{
		super("markdown", "Markdown");
		this.Root.classList.add("dream-markdown-tab");
		const toolbar = document.createElement("div");
		toolbar.className = "dream-markdown-actions";
		toolbar.setAttribute("role", "group");
		toolbar.setAttribute("aria-label", "Dream Markdown actions");
		this.AddButton(toolbar, "copy", "Copy Dream Markdown", Copy);
		this.AddButton(toolbar, "edit", "Edit Dream Markdown", Pencil);
		this.AddButton(toolbar, "save", "Save Dream Markdown", Save);
		this.AddButton(toolbar, "cancel", "Cancel Markdown editing", X);
		this.input.className = "dream-markdown-input";
		this.input.setAttribute("aria-label", "Dream Markdown");
		this.input.spellcheck = true;
		this.error.className = "dream-markdown-error";
		this.error.setAttribute("role", "alert");
		this.preview = new MarkdownEditor("", "Whole Dream", this.HandlePreviewChange, errors, true);
		this.preview.Root.classList.add("dream-markdown-preview");
		this.Root.append(toolbar, this.error, this.input, this.preview.Root);
		this.Root.addEventListener("click", this.clickHandler);
		this.input.addEventListener("input", this.inputHandler);
		this.Refresh();
	}

	public override OnSelected(): void
	{
		this.Refresh();
	}

	public Refresh(): void
	{
		try
		{
			const message = this.store.GetMarkdownError();
			const draft = this.store.GetMarkdownDraft();
			const editing = draft !== null;
			this.input.hidden = !editing;
			this.preview.Root.hidden = editing;
			this.buttons.get("edit")!.hidden = editing;
			this.buttons.get("save")!.hidden = !editing;
			this.buttons.get("cancel")!.hidden = !editing;
			this.error.textContent = message ?? "";
			this.error.hidden = message === null;
			this.input.setAttribute("aria-invalid", String(message !== null));
			this.buttons.get("save")!.disabled = this.busy || message !== null;
			this.buttons.get("cancel")!.disabled = this.busy;
			if (editing)
			{
				if (this.input.value !== draft) this.input.value = draft;
			}
			else if (!this.Root.hidden)
			{
				const markdown = this.controller.GetMarkdown().replace(/^<!-- chora:[^\n]+ -->\n?/gm, "");
				this.preview.SetMarkdown(markdown);
			}
		}
		catch (error)
		{
			this.error.textContent = error instanceof Error ? error.message : "Unable to display Dream Markdown.";
			this.error.hidden = false;
		}
	}

	public override Dispose(): void
	{
		this.Root.removeEventListener("click", this.clickHandler);
		this.input.removeEventListener("input", this.inputHandler);
		this.preview.Dispose();
		super.Dispose();
	}

	private AddButton(toolbar: HTMLElement, action: string, label: string, icon: IconNode): void
	{
		const button = document.createElement("button");
		button.type = "button";
		button.className = "dream-icon-button button-control";
		button.dataset.dreamMarkdownAction = action;
		button.title = label;
		button.setAttribute("aria-label", label);
		const graphic = createElement(icon);
		graphic.setAttribute("aria-hidden", "true");
		button.append(graphic);
		this.buttons.set(action, button);
		toolbar.append(button);
	}

	private HandleInput(): void
	{
		this.controller.UpdateMarkdownDraft(this.input.value);
		this.Refresh();
	}

	private HandlePreviewChange(): void
	{
	}

	private async HandleClickAsync(event: Event): Promise<void>
	{
		const target = event.target as Element | null;
		const button = target?.closest<HTMLButtonElement>("[data-dream-markdown-action]");
		if (button !== null && button !== undefined && !this.busy)
		{
			try
			{
				const action = button.dataset.dreamMarkdownAction;
				if (action === "copy") await this.controller.CopyMarkdownAsync();
				else if (action === "edit") this.controller.BeginMarkdownEditing();
				else if (action === "cancel") this.controller.CancelMarkdownEditing();
				else if (action === "save")
				{
					this.busy = true;
					this.Refresh();
					await this.controller.FinishMarkdownEditingAsync();
				}
				this.busy = false;
				this.Refresh();
				if (action === "edit") this.input.focus();
			}
			catch (error)
			{
				this.busy = false;
				this.Refresh();
				this.errors.Report("DreamMarkdownPanel", error, "The Markdown action could not be completed.");
			}
		}
	}
}