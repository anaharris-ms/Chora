import type { Dream } from "../../shared/dreams/dream-types.js";
import type { ChoraEvents } from "../core/events/chora-events.js";
import { ChoraEventBus, type Unsubscribe } from "../core/events/chora-event-bus.js";
import { CreateDreamSourceSelection } from "./source-selection.js";
import { DreamController } from "./dream-controller.js";
import { DreamStore, type DreamSaveState } from "./dream-store.js";
import { LibraryStore } from "../library/library-store.js";
import { EscapeHtml } from "../ui/html.js";

type DreamFontFamily = "literary" | "serif" | "sans" | "mono";

interface DreamTypography
{
	fontFamily: DreamFontFamily;
	fontSize: number;
}

export class DreamPanel
{
	private static readonly TypographyKey = "chora:dream-typography";
	private readonly subscriptions: Unsubscribe[] = [];
	private typography: DreamTypography = this.LoadTypography();

	public constructor(private readonly root: HTMLElement, private readonly events: ChoraEventBus<ChoraEvents>, private readonly store: DreamStore, private readonly controller: DreamController, private readonly library: LibraryStore)
	{
		this.root.addEventListener("click", (event) => this.HandleClick(event));
		this.root.addEventListener("input", (event) => this.HandleInput(event));
		this.root.addEventListener("change", (event) => this.HandleChange(event));
		this.root.addEventListener("keydown", (event) => this.HandleKeyDown(event));
		this.root.addEventListener("contextmenu", (event) => void this.HandleContextMenuAsync(event));
		this.subscriptions.push(this.events.Subscribe("dream.opened", () => this.Update()));
		this.subscriptions.push(this.events.Subscribe("dream.catalogue-changed", () => this.Update()));
		this.subscriptions.push(this.events.Subscribe("dream.closed", () => this.Update()));
		this.subscriptions.push(this.events.Subscribe("dream.saved", () => this.UpdateStatus()));
		this.subscriptions.push(this.events.Subscribe("dream.structure-changed", () => this.Update()));
		this.subscriptions.push(this.events.Subscribe("dream.signal-added", (event) => this.UpdateAndScrollToSignal(event.signalId)));
		this.subscriptions.push(this.events.Subscribe("dream.changed", () => this.UpdateStatus()));
		this.subscriptions.push(this.events.Subscribe("dream.save-state-changed", () => this.UpdateStatus()));
		this.subscriptions.push(this.events.Subscribe("library.text-opened", () => this.Update()));
		this.Update();
	}

	public Dispose(): void
	{
		for (const unsubscribe of this.subscriptions) unsubscribe();
		this.subscriptions.length = 0;
	}

	private Update(): void
	{
		const dream = this.store.GetActiveDream();
		this.root.innerHTML = dream === null ? this.RenderCatalogue() : this.RenderEditor(dream);
		this.UpdateStatus();
	}

	private RenderCatalogue(): string
	{
		const dreams = [...this.store.GetCatalogue()].sort((first, second) => this.CompareBySource(first, second));
		const content = this.RenderCatalogueContent(dreams);
		return `<section class="dream-catalogue"><header class="catalogue-header"><h3>Dreams</h3><button class="dream-action-link" data-refresh-dreams type="button">Refresh</button></header><div>${content}</div></section>`;
	}

	private RenderCatalogueContent(dreams: Dream[]): string
	{
		let content = `<p class="dream-empty">No Dreams yet.</p>`;

		if (dreams.length > 0)
		{
			const divisions = dreams.map((dream) => this.FindDivision(dream));
			const hasDivisions = divisions.some((division) => division !== null);

			if (hasDivisions)
			{
				const groups = new Map<string, { label: string; dreams: Dream[] }>();

				for (let index = 0; index < dreams.length; index += 1)
				{
					const dream = dreams[index];
					const division = divisions[index] ?? null;
					if (dream !== undefined)
					{
						const key = division === null ? `${dream.workId}:unplaced` : `${dream.workId}:${division.kind}:${division.value}`;
						const label = division === null ? "Unplaced" : this.FormatDivisionLabel(division.kind, division.value);
						const group = groups.get(key) ?? { label, dreams: [] };
						group.dreams.push(dream);
						groups.set(key, group);
					}
				}

				content = [...groups.values()].map((group) => `<section class="catalogue-group"><h4>${EscapeHtml(group.label)}</h4>${group.dreams.map((dream) => this.RenderCatalogueItem(dream)).join("")}</section>`).join("");
			}
			else content = dreams.map((dream) => this.RenderCatalogueItem(dream)).join("");
		}

		return content;
	}

	private RenderCatalogueItem(dream: Dream): string
	{
		const item = `<button class="catalogue-item" type="button" data-dream-id="${EscapeHtml(dream.id)}"><strong>${EscapeHtml(dream.title || "Untitled")}</strong><span class="catalogue-location">${EscapeHtml(dream.dialogue ?? dream.workId)} &middot; ${EscapeHtml(dream.source.locatorStart?.value ?? "source")}</span><span>${dream.signals.length} signals</span></button>`;
		return item;
	}

	private FindDivision(dream: Dream): { kind: string; value: string } | null
	{
		let division = dream.source.division ?? null;
		const document = this.library.GetText();

		if (division === null && document?.id === dream.workId)
		{
			const sourceSegment = document.segments.find((segment) => segment.key === dream.source.start.segmentKey)
				?? document.segments.find((segment) => segment.locator?.value === dream.source.locatorStart?.value);
			division = sourceSegment?.division ?? null;
		}

		return division;
	}

	private FormatDivisionLabel(kind: string, value: string): string
	{
		const kindLabel = `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
		const romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
		const numericIndex = Number.parseInt(value, 10) - 1;
		const valueLabel = kind.toLowerCase() === "book" ? romanNumbers[numericIndex] ?? value : value;
		const label = `${kindLabel} ${valueLabel}`;
		return label;
	}

	private CompareBySource(first: Dream, second: Dream): number
	{
		let comparison = first.workId.localeCompare(second.workId);
		if (comparison === 0) comparison = this.CompareLocators(first.source.locatorStart?.value ?? "", second.source.locatorStart?.value ?? "");
		if (comparison === 0) comparison = first.source.start.segmentKey.localeCompare(second.source.start.segmentKey);
		if (comparison === 0) comparison = first.source.start.offset - second.source.start.offset;
		if (comparison === 0) comparison = first.title.localeCompare(second.title);
		return comparison;
	}

	private CompareLocators(first: string, second: string): number
	{
		const firstMatch = /^(\d+)([a-e])$/iu.exec(first);
		const secondMatch = /^(\d+)([a-e])$/iu.exec(second);
		let comparison = 0;

		if (firstMatch !== null && secondMatch !== null)
		{
			comparison = Number.parseInt(firstMatch[1] ?? "0", 10) - Number.parseInt(secondMatch[1] ?? "0", 10);
			if (comparison === 0) comparison = (firstMatch[2] ?? "").localeCompare(secondMatch[2] ?? "");
		}
		else
		{
			comparison = first.localeCompare(second, undefined, { numeric: true });
		}

		return comparison;
	}

	private RenderEditor(dream: Dream): string
	{
		const signals = dream.signals.map((signal) => `<section class="signal-item" data-signal-id="${EscapeHtml(signal.id)}"><div class="signal-row"><strong class="signal-heading">${EscapeHtml(signal.text)}</strong><button class="signal-remove" data-remove-signal="${EscapeHtml(signal.id)}" type="button" title="Remove signal" aria-label="Remove signal">&times;</button></div><textarea class="signal-description" data-signal-description="${EscapeHtml(signal.id)}" placeholder="Description (optional)">${EscapeHtml(signal.description)}</textarea></section>`).join("");
		const familyOptions = this.RenderFontOptions();
		const sizeOptions = [14, 16, 18, 20, 22, 24, 28, 32].map((size) => `<option value="${size}"${size === this.typography.fontSize ? " selected" : ""}>${size}px</option>`).join("");
		const saveIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"></path><path d="M8 4v6h8V4M8 20v-6h8v6"></path></svg>`;
		const closeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>`;
		const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>`;

		return `<section class="dream-panel dream-font-${this.typography.fontFamily}" style="--dream-font-size:${this.typography.fontSize}px"><header class="dream-header"><h2>Dream</h2><div class="dream-toolbar"><span class="dream-toolbar-status" data-dream-status></span><label class="toolbar-field">Typeface<select data-dream-font-family>${familyOptions}</select></label><label class="toolbar-field">Size<select data-dream-font-size>${sizeOptions}</select></label><button class="dream-icon-button" data-save-dream type="button" title="Save Dream" aria-label="Save Dream">${saveIcon}</button><button class="dream-icon-button" data-delete-dream type="button" title="Delete Dream" aria-label="Delete Dream">${deleteIcon}</button><button class="dream-icon-button" data-close-dream type="button" title="Close Dream" aria-label="Close Dream">${closeIcon}</button></div></header><label class="dream-field"><span>Title <span class="field-optional">optional</span></span><input data-dream-title value="${EscapeHtml(dream.title)}"></label><section class="dream-section"><h3>Source Passage</h3><div class="dream-source-meta">${EscapeHtml(dream.dialogue ?? dream.workId)} &middot; ${EscapeHtml(dream.source.locatorStart?.value ?? "source")}</div><pre class="dream-source" data-dream-source>${EscapeHtml(dream.source.selectedText)}</pre><button class="dream-action-link" data-jump-source type="button">Jump to Source</button></section><section class="dream-section"><h3>Signals</h3><div class="signal-list">${signals || `<p class="dream-empty">No signals.</p>`}</div></section><label class="dream-field dream-exegesis"><span>Exegesis</span><textarea data-auto-expand data-dream-exegesis>${EscapeHtml(dream.reflection)}</textarea></label><footer class="dream-save"><button class="dream-action-link" data-save-dream type="button">Save</button><button class="dream-action-link" data-close-dream type="button">Close</button><button class="dream-action-link dream-delete-link" data-delete-dream type="button">Delete</button></footer></section>`;
	}

	private RenderFontOptions(): string
	{
		const options: Array<{ value: DreamFontFamily; label: string }> = [
			{ value: "literary", label: "Literary" },
			{ value: "serif", label: "Serif" },
			{ value: "sans", label: "Sans serif" },
			{ value: "mono", label: "Monospace" }
		];
		return options.map((option) => `<option value="${option.value}"${option.value === this.typography.fontFamily ? " selected" : ""}>${option.label}</option>`).join("");
	}

	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const dreamId = target?.closest<HTMLElement>("[data-dream-id]")?.dataset.dreamId;
		const signalId = target?.closest<HTMLElement>("[data-remove-signal]")?.dataset.removeSignal;

		if (dreamId !== undefined) this.controller.Open(dreamId);
		if (signalId !== undefined) this.controller.RemoveSignal(signalId);
		if (target?.closest("[data-save-dream]") !== null) void this.controller.SaveAsync();
		if (target?.closest("[data-close-dream]") !== null) void this.controller.CloseAsync();
		if (target?.closest("[data-delete-dream]") !== null) this.ConfirmDelete();
		if (target?.closest("[data-refresh-dreams]") !== null) void this.controller.RefreshAsync();
		if (target?.closest("[data-jump-source]") !== null)
		{
			const selection = this.store.GetActiveDream()?.source;
			if (selection !== undefined) void this.events.PublishAsync("library.jump-requested", { selection });
		}
	}

	private ConfirmDelete(): void
	{
		const dream = this.store.GetActiveDream();
		const name = dream?.title.trim() || "this Dream";
		const confirmed = dream !== null && window.confirm(`Delete ${name}? This cannot be undone.`);
		if (confirmed) void this.controller.DeleteAsync();
	}

	private HandleInput(event: Event): void
	{
		const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;

		if (target?.matches("[data-dream-title]") === true) this.controller.UpdateTitle(target.value);
		if (target?.matches("[data-dream-exegesis]") === true) this.controller.UpdateExegesis(target.value);
		if (target?.matches("[data-signal-description]") === true) this.controller.UpdateSignal(target.dataset.signalDescription ?? "", target.value);
	}

	private HandleChange(event: Event): void
	{
		const target = event.target as HTMLSelectElement | null;

		if (target?.matches("[data-dream-font-family]") === true) this.typography.fontFamily = target.value as DreamFontFamily;
		if (target?.matches("[data-dream-font-size]") === true) this.typography.fontSize = Number.parseInt(target.value, 10);
		this.SaveTypography();
		this.ApplyTypography();
	}

	private HandleKeyDown(event: KeyboardEvent): void
	{
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
		{
			event.preventDefault();
			event.stopPropagation();
			void this.controller.SaveAsync();
		}
	}

	private async HandleContextMenuAsync(event: Event): Promise<void>
	{
		const source = this.root.querySelector<HTMLElement>("[data-dream-source]");
		const browserSelection = window.getSelection();
		const range = browserSelection !== null && browserSelection.rangeCount > 0 ? browserSelection.getRangeAt(0) : null;
		const isInsideSource = source !== null && range !== null && !range.collapsed && source.contains(range.commonAncestorContainer);

		if (source !== null && range !== null && isInsideSource)
		{
			event.preventDefault();
			const prefix = range.cloneRange();
			prefix.selectNodeContents(source);
			prefix.setEnd(range.startContainer, range.startOffset);
			const startOffset = prefix.toString().length;
			const endOffset = startOffset + range.toString().length;
			const dream = this.store.GetActiveDream();
			const document = this.library.GetText();

			if (dream !== null && document !== null)
			{
				const selection = CreateDreamSourceSelection(document, dream.source, startOffset, endOffset);
				if (selection !== null)
				{
					await this.controller.HandleSourceSelectionAsync(selection);
				}
			}
		}
	}

	private UpdateStatus(): void
	{
		const status = this.root.querySelector<HTMLElement>("[data-dream-status]");
		const saveButtons = this.root.querySelectorAll<HTMLButtonElement>("[data-save-dream]");
		const saveState = this.store.GetSaveState();
		if (status !== null) status.textContent = this.GetStatusText(saveState);
		saveButtons.forEach((button) =>
		{
			button.disabled = saveState === "saving";
		});
	}

	private UpdateAndScrollToSignal(signalId: string): void
	{
		this.Update();
		const panel = this.root.querySelector<HTMLElement>(".dream-panel");
		const signal = this.root.querySelector<HTMLElement>(`[data-signal-id="${CSS.escape(signalId)}"]`);

		if (panel !== null && signal !== null)
		{
			const panelBounds = panel.getBoundingClientRect();
			const signalBounds = signal.getBoundingClientRect();
			const targetPosition = panel.scrollTop + signalBounds.top - panelBounds.top - 24;
			panel.scrollTop = Math.max(0, targetPosition);
		}
	}

	private GetStatusText(saveState: DreamSaveState): string
	{
		let text = this.store.GetIsDirty() ? "Unsaved" : "Saved";
		if (saveState === "saving") text = "Saving…";
		if (saveState === "error") text = "Save failed";
		return text;
	}

	private ApplyTypography(): void
	{
		const panel = this.root.querySelector<HTMLElement>(".dream-panel");
		if (panel !== null)
		{
			panel.classList.remove("dream-font-literary", "dream-font-serif", "dream-font-sans", "dream-font-mono");
			panel.classList.add(`dream-font-${this.typography.fontFamily}`);
			panel.style.setProperty("--dream-font-size", `${this.typography.fontSize}px`);
		}
	}

	private LoadTypography(): DreamTypography
	{
		let typography: DreamTypography = { fontFamily: "literary", fontSize: 18 };

		try
		{
			const stored = window.localStorage.getItem(DreamPanel.TypographyKey);
			if (stored !== null)
			{
				const candidate = JSON.parse(stored) as Partial<DreamTypography>;
				const families: DreamFontFamily[] = ["literary", "serif", "sans", "mono"];
				if (candidate.fontFamily !== undefined && families.includes(candidate.fontFamily)) typography.fontFamily = candidate.fontFamily;
				if (typeof candidate.fontSize === "number" && candidate.fontSize >= 14 && candidate.fontSize <= 32) typography.fontSize = candidate.fontSize;
			}
		}
		catch
		{
			// Invalid preferences fall back to the defaults.
		}

		return typography;
	}

	private SaveTypography(): void
	{
		try
		{
			window.localStorage.setItem(DreamPanel.TypographyKey, JSON.stringify(this.typography));
		}
		catch
		{
			// The editor remains usable when browser storage is unavailable.
		}
	}
}
