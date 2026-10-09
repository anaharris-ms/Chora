import { TabPanel } from "./TabPanel.js";

// Owns persistent panels and accessible tab selection, independent of feature data.
export class TabControl
{
	// Allocates unique DOM identities across controls.
	private static nextId = 0;
	// Persistent control root.
	public readonly Root: HTMLElement = document.createElement("div");
	// Owned panel collection.
	public readonly Panels: readonly TabPanel[];
	// Tab buttons in panel order.
	private readonly buttons: HTMLButtonElement[] = [];
	// Current selected index.
	private selectedIndex = -1;
	// Keyboard listener retained for disposal.
	private readonly keyHandler = this.HandleKeyDown.bind(this);
	// Click listener retained for disposal.
	private readonly clickHandler = this.HandleClick.bind(this);

	// Mounts each panel once and initially selects the first.
	public constructor(panels: readonly TabPanel[], label: string, private readonly selectionChanged?: (id: string) => void)
	{
		const ids = new Set<string>();
		for (const panel of panels)
		{
			if (ids.has(panel.Id)) throw new Error("Tab panel identifiers must be unique.");
			ids.add(panel.Id);
		}
		this.Panels = Object.freeze([...panels]);
		TabControl.nextId += 1;
		const prefix = `tabs-${TabControl.nextId}`;
		const list = document.createElement("div");
		list.className = "tab-list";
		list.setAttribute("role", "tablist");
		list.setAttribute("aria-label", label);
		this.Root.className = "tab-control";
		this.Root.append(list);
		for (const panel of this.Panels)
		{
			const button = document.createElement("button");
			const index = this.buttons.length;
			button.type = "button";
			button.id = `${prefix}-tab-${index}`;
			button.textContent = panel.Title;
			button.setAttribute("role", "tab");
			panel.Root.id = `${prefix}-panel-${index}`;
			button.setAttribute("aria-controls", panel.Root.id);
			panel.Root.setAttribute("aria-labelledby", button.id);
			this.buttons.push(button);
			list.append(button);
			this.Root.append(panel.Root);
		}
		list.addEventListener("click", this.clickHandler);
		list.addEventListener("keydown", this.keyHandler);
		const first = this.Panels[0];
		if (first !== undefined) this.Select(first.Id);
	}

	// Selects content without replacing nodes or moving focus programmatically.
	public Select(id: string): void
	{
		for (let index = 0; index < this.Panels.length; index += 1)
		{
			if (this.Panels[index]?.Id === id) this.selectedIndex = index;
		}
		for (let index = 0; index < this.Panels.length; index += 1)
		{
			const panel = this.Panels[index];
			const button = this.buttons[index];
			const selected = index === this.selectedIndex;
			if (panel !== undefined) panel.Root.hidden = !selected;
			if (button !== undefined)
			{
				button.setAttribute("aria-selected", String(selected));
				button.tabIndex = selected ? 0 : -1;
			}
		}
		const selected = this.Panels[this.selectedIndex];
		selected?.OnSelected();
		if (selected !== undefined) this.selectionChanged?.(selected.Id);
	}

	// Returns the identifier of the selected panel, or null when the control is empty.
	public GetSelectedId(): string | null
	{
		const id = this.Panels[this.selectedIndex]?.Id ?? null;

		return id;
	}

	// Releases listeners and all owned panels.
	public Dispose(): void
	{
		const list = this.Root.querySelector<HTMLElement>(".tab-list");
		list?.removeEventListener("click", this.clickHandler);
		list?.removeEventListener("keydown", this.keyHandler);
		for (const panel of this.Panels) panel.Dispose();
		this.Root.remove();
	}

	// Selects a clicked tab belonging to this control.
	private HandleClick(event: Event): void
	{
		const target = event.target as HTMLElement | null;
		const button = target?.closest("button");
		for (let index = 0; index < this.buttons.length; index += 1)
		{
			const panel = this.Panels[index];
			if (this.buttons[index] === button && panel !== undefined) this.Select(panel.Id);
		}
	}

	// Implements automatic activation with arrow, Home, and End keys.
	private HandleKeyDown(event: KeyboardEvent): void
	{
		let index = this.selectedIndex;
		if (event.key === "ArrowRight") index = (index + 1) % this.Panels.length;
		else if (event.key === "ArrowLeft") index = (index - 1 + this.Panels.length) % this.Panels.length;
		else if (event.key === "Home") index = 0;
		else if (event.key === "End") index = this.Panels.length - 1;
		const panel = this.Panels[index];
		if (panel !== undefined && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
		{
			event.preventDefault();
			this.Select(panel.Id);
			this.buttons[index]?.focus();
		}
	}
}