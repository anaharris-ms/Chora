import type { Dream, DreamSignal } from "../../shared/dreams/DreamTypes.js";
import { TabPanel } from "../ui/TabPanel.js";
import { EscapeHtml } from "../ui/Html.js";
import { DreamController } from "./DreamController.js";
import { MarkdownEditor } from "../ui/MarkdownEditor.js";
import type { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { TrashIcon, MoreIcon } from "../ui/Icons.js";

// Owns signal row DOM and disclosure behavior, without replacing the Dream editor.
export class DreamSignalsPanel extends TabPanel
{
	// Persistent list root.
	private readonly list: HTMLElement = document.createElement("div");
	private readonly detail: HTMLElement = document.createElement("div");
	private readonly navigation = new Map<string, HTMLElement>();
	private selectedSignalId: string | null = null;
	// Empty-state notice.
	private readonly empty: HTMLElement = document.createElement("p");
	// Rendered rows indexed by stable signal identity.
	private readonly rows = new Map<string, HTMLElement>();
	// Rich text editors retain selection and history while their rows are collapsed.
	private readonly editors = new Map<string, MarkdownEditor>();
	// Only the latest reveal request may scroll after editor initialization.
	private revealVersion = 0;
	// Retained listeners for disposal.
	private readonly clickHandler = this.HandleClick.bind(this);
	// Dream identity currently rendered by this panel.
	private dreamId: string | null = null;

	// Connects the signal panel to its workflow controller.
	public constructor(private readonly controller: DreamController, private readonly errors: ErrorManager)
	{
		super("signals", "Signals");
		this.Root.classList.add("dream-signals-panel");
		this.list.className = "signal-list";
		this.list.setAttribute("aria-label", "Signals");
		this.detail.className = "signal-detail";
		this.empty.className = "dream-empty";
		this.empty.textContent = "No signals.";
		this.detail.append(this.empty);
		this.Root.append(this.list, this.detail);
		this.Root.addEventListener("click", this.clickHandler);
	}

	// Reconciles structural changes while retaining existing editors and disclosure state.
	public Update(dream: Dream): void
	{
		this.dreamId = dream.id;
		const ids = new Set<string>();
		for (const signal of dream.signals) ids.add(signal.id);
		for (const [id, row] of this.rows)
		{
			if (!ids.has(id))
			{
				this.editors.get(id)?.Dispose();
				this.editors.delete(id);
				row.remove();
				this.rows.delete(id);
				this.navigation.get(id)?.remove();
				this.navigation.delete(id);
			}
		}
		let previous: HTMLElement | null = null;
		for (const signal of dream.signals)
		{
			let row = this.rows.get(signal.id);
			if (row === undefined)
			{
				row = this.CreateRow(signal);
				this.rows.set(signal.id, row);
			}
			else
			{
				this.editors.get(signal.id)?.SetMarkdown(signal.description);
			}
			const header = this.navigation.get(signal.id)!;
			const next: ChildNode | null = previous === null ? this.list.firstChild : previous.nextSibling;
			if (next !== header) this.list.insertBefore(header, next);
			previous = header;
		}
		this.empty.hidden = dream.signals.length > 0;
		const remembered = this.controller.GetSelectedSignal(dream.id);
		const selected = remembered !== null && ids.has(remembered)
			? remembered
			: this.selectedSignalId !== null && ids.has(this.selectedSignalId)
				? this.selectedSignalId
				: dream.signals[0]?.id ?? null;
		this.SelectSignal(selected);
	}

	private SelectSignal(signalId: string | null): void
	{
		this.selectedSignalId = signalId;
		if (this.dreamId !== null) this.controller.RememberSelectedSignal(this.dreamId, signalId);
		for (const [id, row] of this.rows)
		{
			const selected = id === signalId;
			row.hidden = !selected;
			const header = this.navigation.get(id);
			header?.classList.toggle("selected", selected);
			const button = header?.querySelector("[data-signal-toggle]");
			button?.setAttribute("aria-current", String(selected));
			button?.setAttribute("aria-expanded", String(selected));
		}
	}

	// Expands a new signal and reveals its final layout after Milkdown is ready.
	public async ShowSignalAsync(signalId: string): Promise<void>
	{
		const row = this.rows.get(signalId);
		const editor = this.editors.get(signalId);
		const header = this.navigation.get(signalId);
		this.revealVersion += 1;
		const version = this.revealVersion;

		if (row !== undefined && editor !== undefined && header !== undefined)
		{
			this.SelectSignal(signalId);
			await editor.Ready;
			const canReveal = version === this.revealVersion
				&& row.isConnected
				&& header.isConnected
				&& !this.Root.hidden
				&& !row.hidden;

			if (canReveal)
			{
				editor.Focus();
				header.scrollIntoView({ block: "nearest", behavior: "smooth" });
				row.scrollIntoView({ block: "nearest", behavior: "smooth" });
			}
		}
	}

	// Releases listeners and the owned content.
	public override Dispose(): void
	{
		this.revealVersion += 1;
		this.Root.removeEventListener("click", this.clickHandler);
		for (const editor of this.editors.values()) editor.Dispose();
		this.editors.clear();
		this.rows.clear();
		this.navigation.clear();
		super.Dispose();
	}

	// Creates a signal with a persistent, initially collapsed description editor.
	private CreateRow(signal: DreamSignal): HTMLElement
	{
		const row = document.createElement("section");
		row.className = "signal-item";
		row.dataset.signalId = signal.id;
		const header = document.createElement("div");
		header.className = "signal-header";
		header.innerHTML = `<button class="signal-row button-control" data-signal-toggle="${EscapeHtml(signal.id)}" type="button" aria-expanded="false"><strong class="signal-heading">${EscapeHtml(signal.text)}</strong></button>`;
		this.navigation.set(signal.id, header);
		const escapedSignalId = EscapeHtml(signal.id);
		row.innerHTML = `<header class="signal-detail-title"><details class="action-menu"><summary title="Signal actions" aria-label="Signal actions">${MoreIcon}</summary><div class="action-menu-items"><button data-add-signal-to-idea="${escapedSignalId}" type="button">Add to Idea&hellip;</button><button data-delete-signal="${escapedSignalId}" type="button">${TrashIcon}Delete signal</button></div></details></header>`;
		const body = document.createElement("div");
		body.className = "signal-detail-body";
		row.append(body);
		this.detail.append(row);
		const change = this.HandleDescriptionChange.bind(this, signal.id);
		const editor = new MarkdownEditor(signal.description, "Signal description", change, this.errors);
		editor.Root.classList.add("signal-markdown-editor");
		editor.Root.dataset.signalDescription = signal.id;
		this.editors.set(signal.id, editor);
		const actionMenu = row.querySelector<HTMLDetailsElement>(".action-menu");
		const markdownToolbar = editor.Root.querySelector<HTMLElement>(".markdown-toolbar");
		if (actionMenu !== null && markdownToolbar !== null) markdownToolbar.append(actionMenu);
		row.querySelector(".signal-detail-title")?.remove();
		const observation = document.createElement("section");
		observation.className = "signal-observation";
		observation.append(editor.Root);
		body.append(observation);
		return row;
	}

	// Toggles visibility without removing focusable controls or resetting scroll.
	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const menu = target?.closest<HTMLDetailsElement>(".action-menu");
		if (menu !== null && menu !== undefined && target?.closest("button") !== null) menu.open = false;
		const deleteSignalId = target?.closest<HTMLElement>("[data-delete-signal]")?.dataset.deleteSignal;
		if (deleteSignalId !== undefined) this.controller.RemoveSignal(deleteSignalId);
		const addToIdeaSignalId = target?.closest<HTMLElement>("[data-add-signal-to-idea]")?.dataset.addSignalToIdea;

		if (addToIdeaSignalId !== undefined)
		{
			const addition = this.controller.AddSignalToIdeaAsync(addToIdeaSignalId);
			void addition;
		}
		const toggleButton = target?.closest<HTMLButtonElement>("[data-signal-toggle]");
		if (toggleButton !== null && toggleButton !== undefined)
		{
			this.revealVersion += 1;
			this.SelectSignal(toggleButton.dataset.signalToggle ?? null);
		}
	}

	// Sends description edits through the existing autosave workflow.
	private HandleDescriptionChange(signalId: string, markdown: string): void
	{
		this.controller.UpdateSignal(signalId, markdown);
	}
}