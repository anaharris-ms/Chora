import type { Dream, DreamSignal, DreamResonance } from "../../shared/dreams/DreamTypes.js";
import { TabPanel } from "../ui/TabPanel.js";
import { EscapeHtml } from "../ui/Html.js";
import { DreamController } from "./DreamController.js";
import { MarkdownEditor } from "../ui/MarkdownEditor.js";
import type { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";
import { createElement, MessageCircle, Link2, Plus } from "lucide";
import { LinkIcon, SaveIcon, TrashIcon, MoreIcon, NextIcon } from "../ui/Icons.js";

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
	// Signal identifiers currently showing an unsaved resonance quick-capture input.
	private readonly captureRows = new Set<string>();
	// Retained listeners for disposal.
	private readonly clickHandler = this.HandleClick.bind(this);
	private readonly keyDownHandler = this.HandleKeyDown.bind(this);

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
		this.Root.addEventListener("keydown", this.keyDownHandler);
	}

	// Reconciles structural changes while retaining existing editors and disclosure state.
	public Update(dream: Dream): void
	{
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
				this.captureRows.delete(id);
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
				this.RefreshRowResonances(signal.id, row);
			}
			const header = this.navigation.get(signal.id)!;
			const next: ChildNode | null = previous === null ? this.list.firstChild : previous.nextSibling;
			if (next !== header) this.list.insertBefore(header, next);
			previous = header;
		}
		this.empty.hidden = dream.signals.length > 0;
		const selected = this.selectedSignalId !== null && ids.has(this.selectedSignalId)
			? this.selectedSignalId : dream.signals[0]?.id ?? null;
		this.SelectSignal(selected);
	}

	private SelectSignal(signalId: string | null): void
	{
		this.selectedSignalId = signalId;
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
		this.revealVersion += 1;
		const version = this.revealVersion;
		if (row !== undefined && editor !== undefined)
		{
			this.SelectSignal(signalId);
			await editor.Ready;
			if (version === this.revealVersion && row.isConnected && !this.Root.hidden && !row.hidden)
			{
				row.scrollIntoView({ block: "start", behavior: "instant" });
				editor.Focus();
			}
		}
	}

	// Releases listeners and the owned content.
	public override Dispose(): void
	{
		this.revealVersion += 1;
		this.Root.removeEventListener("click", this.clickHandler);
		this.Root.removeEventListener("keydown", this.keyDownHandler);
		for (const editor of this.editors.values()) editor.Dispose();
		this.editors.clear();
		this.rows.clear();
		this.navigation.clear();
		this.captureRows.clear();
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
		header.innerHTML = `<button class="signal-row button-control" data-signal-toggle="${EscapeHtml(signal.id)}" type="button" aria-expanded="false"><strong class="signal-heading">${EscapeHtml(signal.text)}</strong></button><button class="signal-chat-button dream-icon-button button-control" data-signal-chat="${EscapeHtml(signal.id)}" type="button" title="Chat with the model" aria-label="Chat with the model"></button>`;
		this.navigation.set(signal.id, header);
		row.innerHTML = `<header class="signal-detail-title"><details class="action-menu"><summary title="Signal actions" aria-label="Signal actions">${MoreIcon}</summary><div class="action-menu-items"><button data-delete-signal="${EscapeHtml(signal.id)}" type="button">${TrashIcon}Delete signal</button></div></details></header>`;
		const body = document.createElement("div");
		body.className = "signal-detail-body";
		row.append(body);
		this.detail.append(row);
		const chatButton = header.querySelector("[data-signal-chat]");
		const icon = createElement(MessageCircle);
		icon.setAttribute("aria-hidden", "true");
		chatButton?.append(icon);
		const change = this.HandleDescriptionChange.bind(this, signal.id);
		const editor = new MarkdownEditor(signal.description, "Signal description", change, this.errors);
		editor.Root.classList.add("signal-markdown-editor");
		editor.Root.dataset.signalDescription = signal.id;
		this.editors.set(signal.id, editor);
		body.append(editor.Root);
		const section = document.createElement("details");
		section.className = "resonance-section";
		section.dataset.resonanceSection = "";
		section.open = true;
		section.innerHTML = `<summary class="resonance-section-heading"><span class="resonance-heading-icon" aria-hidden="true"></span><span>Resonances</span><button class="dream-icon-button button-control resonance-add-button" data-resonance-add type="button" title="Add resonance" aria-label="Add resonance"></button></summary><div class="resonance-list" data-resonance-list>${this.RenderResonanceItems(signal)}</div>`;
		const addIcon = createElement(Plus);
		addIcon.setAttribute("aria-hidden", "true");
		section.querySelector("[data-resonance-add]")?.append(addIcon);
		const resonanceIcon = createElement(Link2);
		section.querySelector(".resonance-heading-icon")?.append(resonanceIcon);
		body.append(section);
		if (signal.resonances.length === 0) this.OpenResonanceCapture(signal.id, row, false);
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
		const chatSignalId = target?.closest<HTMLElement>("[data-signal-chat]")?.dataset.signalChat;
		if (chatSignalId !== undefined)
		{
			this.controller.ChatWithSignal(chatSignalId);
		}
		const toggleButton = target?.closest<HTMLButtonElement>("[data-signal-toggle]");
		if (toggleButton !== null && toggleButton !== undefined)
		{
			this.revealVersion += 1;
			this.SelectSignal(toggleButton.dataset.signalToggle ?? null);
		}

		const addButton = target?.closest<HTMLElement>("[data-resonance-add]");
		const addRow = addButton?.closest<HTMLElement>(".signal-item");
		if (addButton !== null && addButton !== undefined && addRow !== null && addRow !== undefined)
		{
			event.preventDefault();
			const section = addRow.querySelector<HTMLDetailsElement>("[data-resonance-section]");
			if (section !== null) section.open = true;
			this.OpenResonanceCapture(addRow.dataset.signalId ?? "", addRow);
		}

		const saveButton = target?.closest<HTMLElement>("[data-resonance-save]");
		const captureRow = saveButton?.closest<HTMLElement>("[data-resonance-capture]");
		const captureInput = captureRow?.querySelector<HTMLInputElement>("[data-resonance-input]");
		if (captureInput !== null && captureInput !== undefined)
		{
			void this.CommitResonanceCaptureAsync(captureInput);
		}

		const editButton = target?.closest<HTMLElement>("[data-resonance-edit]");
		const editRow = editButton?.closest<HTMLElement>(".signal-item");
		if (editButton !== null && editButton !== undefined && editRow !== null && editRow !== undefined)
		{
			this.OpenResonanceEdit(editRow.dataset.signalId ?? "", editButton.dataset.resonanceEdit ?? "", editRow);
		}

		const deleteButton = target?.closest<HTMLElement>("[data-resonance-delete]");
		const deleteRow = deleteButton?.closest<HTMLElement>(".signal-item");
		if (deleteButton !== null && deleteButton !== undefined && deleteRow !== null && deleteRow !== undefined)
		{
			const signalId = deleteRow.dataset.signalId ?? "";
			this.controller.RemoveResonance(signalId, deleteButton.dataset.resonanceDelete ?? "");
			this.RefreshRowResonances(signalId, deleteRow);
		}

		const attachButton = target?.closest<HTMLElement>("[data-resonance-attach]");
		const attachRow = attachButton?.closest<HTMLElement>(".signal-item");
		if (attachButton !== null && attachButton !== undefined && attachRow !== null && attachRow !== undefined)
		{
			const signalId = attachRow.dataset.signalId ?? "";
			this.controller.RequestAttachResonanceTarget(signalId, attachButton.dataset.resonanceAttach ?? "");
			this.RefreshRowResonances(signalId, attachRow);
		}

		const cancelAttachButton = target?.closest<HTMLElement>("[data-resonance-attach-cancel]");
		const cancelAttachRow = cancelAttachButton?.closest<HTMLElement>(".signal-item");
		if (cancelAttachButton !== null && cancelAttachButton !== undefined && cancelAttachRow !== null && cancelAttachRow !== undefined)
		{
			this.controller.CancelResonanceAttach();
			this.RefreshRowResonances(cancelAttachRow.dataset.signalId ?? "", cancelAttachRow);
		}

		const targetJumpButton = target?.closest<HTMLElement>("[data-resonance-target-jump]");
		if (targetJumpButton !== null && targetJumpButton !== undefined)
		{
			const item = targetJumpButton.closest<HTMLElement>("[data-resonance-item]");
			const jumpRow = targetJumpButton.closest<HTMLElement>(".signal-item");
			const signalId = jumpRow?.dataset.signalId;
			const resonanceId = item?.dataset.resonanceItem;
			if (signalId !== undefined && resonanceId !== undefined) this.controller.JumpToResonanceTarget(signalId, resonanceId, targetJumpButton.dataset.resonanceTargetJump ?? "");
		}

		const targetRemoveButton = target?.closest<HTMLElement>("[data-resonance-target-remove]");
		if (targetRemoveButton !== null && targetRemoveButton !== undefined)
		{
			const item = targetRemoveButton.closest<HTMLElement>("[data-resonance-item]");
			const removeRow = targetRemoveButton.closest<HTMLElement>(".signal-item");
			const signalId = removeRow?.dataset.signalId;
			const resonanceId = item?.dataset.resonanceItem;
			if (signalId !== undefined && resonanceId !== undefined && removeRow !== null && removeRow !== undefined)
			{
				this.controller.RemoveResonanceTarget(signalId, resonanceId, targetRemoveButton.dataset.resonanceTargetRemove ?? "");
				this.RefreshRowResonances(signalId, removeRow);
			}
		}
	}

	// Commits or cancels an in-progress resonance quick-capture on Enter/Escape.
	private HandleKeyDown(event: KeyboardEvent): void
	{
		const target = event.target as HTMLElement | null;
		if (target !== null && target.matches("[data-resonance-input]"))
		{
			if (event.key === "Enter")
			{
				event.preventDefault();
				void this.CommitResonanceCaptureAsync(target as HTMLInputElement);
			}
			else if (event.key === "Escape")
			{
				event.preventDefault();
				this.CancelResonanceCapture(target as HTMLInputElement);
			}
		}
	}

	// Reveals an empty quick-capture input for a new resonance on this signal.
	private OpenResonanceCapture(signalId: string, row: HTMLElement, focus = true): void
	{
		if (signalId.length > 0 && !this.captureRows.has(signalId))
		{
			const list = row.querySelector<HTMLElement>("[data-resonance-list]");
			if (list !== null)
			{
				this.captureRows.add(signalId);
				const captureRow = this.CreateCaptureRow("");
				list.append(captureRow);
			}
		}
		if (focus) row.querySelector<HTMLInputElement>("[data-resonance-input]")?.focus();
	}

	// Replaces one resonance's compact display with an editable quick-capture input, prefilled with its note.
	private OpenResonanceEdit(signalId: string, resonanceId: string, row: HTMLElement): void
	{
		if (signalId.length > 0 && resonanceId.length > 0 && !this.captureRows.has(signalId))
		{
			const item = row.querySelector<HTMLElement>(`[data-resonance-item="${CSS.escape(resonanceId)}"]`);
			const dream = this.controller.GetActiveDream();
			const signal = dream?.signals.find((candidate) => candidate.id === signalId);
			const resonance = signal?.resonances.find((candidate) => candidate.id === resonanceId);
			if (item !== null && item !== undefined && resonance !== undefined)
			{
				this.captureRows.add(signalId);
				const captureRow = this.CreateCaptureRow(resonance.note);
				captureRow.dataset.resonanceEditId = resonanceId;
				item.replaceWith(captureRow);
				const input = captureRow.querySelector<HTMLInputElement>("input");
				input?.focus();
				input?.select();
			}
		}
	}

	// Builds the shared markup for a resonance quick-capture input, used for both new and edited resonances.
	private CreateCaptureRow(initialValue: string): HTMLElement
	{
		const captureRow = document.createElement("div");
		captureRow.className = "resonance-capture";
		captureRow.dataset.resonanceCapture = "";
		captureRow.innerHTML = `<input type="text" class="resonance-input" data-resonance-input aria-label="Resonance note" placeholder="What does this bring to mind?" value="${EscapeHtml(initialValue)}"><button class="dream-icon-button button-control" data-resonance-save type="button" title="Save resonance" aria-label="Save resonance">${SaveIcon}</button>`;
		return captureRow;
	}

	// Commits a quick-capture input as a new resonance or an updated note, then closes it.
	private async CommitResonanceCaptureAsync(input: HTMLInputElement): Promise<void>
	{
		const row = input.closest<HTMLElement>(".signal-item");
		const captureRow = input.closest<HTMLElement>("[data-resonance-capture]");
		const signalId = row?.dataset.signalId ?? "";
		const resonanceId = captureRow?.dataset.resonanceEditId ?? "";
		const value = input.value;
		if (signalId.length > 0 && value.trim().length > 0)
		{
			if (resonanceId.length > 0) this.controller.UpdateResonanceNote(signalId, resonanceId, value);
			else await this.controller.AddResonanceAsync(signalId, value);
		}
		if (signalId.length > 0 && row !== null && row !== undefined)
		{
			this.captureRows.delete(signalId);
			this.RefreshRowResonances(signalId, row);
		}
	}

	// Discards an in-progress resonance quick-capture without committing it.
	private CancelResonanceCapture(input: HTMLInputElement): void
	{
		const row = input.closest<HTMLElement>(".signal-item");
		const signalId = row?.dataset.signalId;
		if (signalId !== undefined && row !== null && row !== undefined)
		{
			this.captureRows.delete(signalId);
			this.RefreshRowResonances(signalId, row);
		}
	}

	// Regenerates one row's resonance list from current Dream data, unless a quick-capture input is open for it.
	private RefreshRowResonances(signalId: string, row: HTMLElement): void
	{
		if (signalId.length > 0 && !this.captureRows.has(signalId))
		{
			const dream = this.controller.GetActiveDream();
			const signal = dream?.signals.find((candidate) => candidate.id === signalId);
			const list = row.querySelector<HTMLElement>("[data-resonance-list]");
			if (signal !== undefined && list !== null)
			{
				list.innerHTML = this.RenderResonanceItems(signal);
				if (signal.resonances.length === 0) this.OpenResonanceCapture(signalId, row, false);
			}
		}
	}

	// Renders the saved resonances on a signal.
	private RenderResonanceItems(signal: DreamSignal): string
	{
		let content = "";
		if (signal.resonances.length > 0)
		{
			content = "";
			for (const resonance of signal.resonances) content += this.RenderResonanceItem(signal.id, resonance);
		}
		return content;
	}

	// Renders one resonance's compact note, actions, and attached-passage chips.
	private RenderResonanceItem(signalId: string, resonance: DreamResonance): string
	{
		const armed = this.controller.GetArmedResonanceAttach();
		const isArmed = armed !== null && armed.signalId === signalId && armed.resonanceId === resonance.id;
		const attachControl = isArmed
			? `<span class="resonance-armed-hint">Select a passage, then choose &ldquo;Attach to Resonance&rdquo; &middot; <button class="resonance-armed-cancel button-control" data-resonance-attach-cancel type="button">Cancel</button></span>`
			: `<button class="dream-icon-button button-control resonance-icon-button" data-resonance-attach="${EscapeHtml(resonance.id)}" type="button" title="Attach passage" aria-label="Attach passage">${LinkIcon}</button>`;
		const targets = this.RenderResonanceTargets(resonance);
		return `<div class="resonance-item" data-resonance-item="${EscapeHtml(resonance.id)}"><div class="resonance-item-row"><span class="resonance-bullet" aria-hidden="true">${NextIcon}</span><button class="resonance-note button-control" data-resonance-edit="${EscapeHtml(resonance.id)}" type="button">${EscapeHtml(resonance.note)}</button><span class="resonance-item-actions">${attachControl}<button class="dream-icon-button button-control resonance-icon-button" data-resonance-delete="${EscapeHtml(resonance.id)}" type="button" title="Delete resonance" aria-label="Delete resonance">${TrashIcon}</button></span></div>${targets}</div>`;
	}

	// Renders the attached-passage chips for one resonance, or nothing when it has none.
	private RenderResonanceTargets(resonance: DreamResonance): string
	{
		let content = "";
		if (resonance.targets.length > 0)
		{
			let chips = "";
			for (const target of resonance.targets)
			{
				const label = target.selection.locatorStart?.value ?? target.selection.start.segmentKey;
				chips += `<span class="resonance-target-chip"><button class="resonance-target-jump button-control" data-resonance-target-jump="${EscapeHtml(target.id)}" type="button" title="Jump to this passage">${EscapeHtml(label)}</button><button class="resonance-target-remove button-control" data-resonance-target-remove="${EscapeHtml(target.id)}" type="button" title="Remove attachment" aria-label="Remove attachment">&times;</button></span>`;
			}
			content = `<div class="resonance-targets">${chips}</div>`;
		}
		return content;
	}

	// Sends description edits through the existing autosave workflow.
	private HandleDescriptionChange(signalId: string, markdown: string): void
	{
		this.controller.UpdateSignal(signalId, markdown);
	}
}