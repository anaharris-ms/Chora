// A reusable modal popup: an overlay with a titled dialog, a close control, and caller-supplied body content.
// Mounts itself directly under <body>, independent of any panel's own re-render cycle.
export class PopupPanel
{
	private readonly overlay: HTMLElement;
	private readonly body: HTMLElement;
	private isOpen = false;

	public constructor(title: string)
	{
		this.overlay = document.createElement("div");
		this.overlay.className = "popup-overlay";
		this.overlay.hidden = true;
		this.overlay.addEventListener("click", this.HandleOverlayClick.bind(this));

		const dialog = document.createElement("div");
		dialog.className = "popup-dialog";

		const header = document.createElement("header");
		header.className = "popup-header";
		const heading = document.createElement("h4");
		heading.textContent = title;
		const closeButton = document.createElement("button");
		closeButton.type = "button";
		closeButton.className = "popup-close button-control";
		closeButton.setAttribute("aria-label", "Close");
		closeButton.textContent = "\u00d7";
		closeButton.addEventListener("click", () => this.Close());
		header.append(heading, closeButton);

		this.body = document.createElement("div");
		this.body.className = "popup-body";

		dialog.append(header, this.body);
		this.overlay.appendChild(dialog);
		document.body.appendChild(this.overlay);
	}

	// True while the popup is visible.
	public get IsOpen(): boolean
	{
		return this.isOpen;
	}

	// Shows the popup.
	public Open(): void
	{
		this.isOpen = true;
		this.overlay.hidden = false;
	}

	// Hides the popup.
	public Close(): void
	{
		this.isOpen = false;
		this.overlay.hidden = true;
	}

	// Replaces the popup body's markup. Callers re-render this whenever the underlying data changes.
	public SetBodyHtml(html: string): void
	{
		this.body.innerHTML = html;
	}

	// Registers a delegated click handler scoped to the popup body.
	public OnBodyClick(handler: (event: MouseEvent) => void): void
	{
		this.body.addEventListener("click", handler);
	}

	// Registers delegated input handling for editable popup fields.
	public OnBodyInput(handler: (event: Event) => void): void
	{
		this.body.addEventListener("input", handler);
	}

	// Refreshes one section without replacing unrelated inputs or their focus.
	public SetSectionHtml(selector: string, html: string): void
	{
		const section = this.body.querySelector<HTMLElement>(selector);
		if (section !== null) section.innerHTML = html;
	}

	// Removes the popup from the document and releases its listeners.
	public Dispose(): void
	{
		this.overlay.remove();
	}

	// Closes the popup when the backdrop itself, not the dialog, is clicked.
	private HandleOverlayClick(event: MouseEvent): void
	{
		if (event.target === this.overlay) this.Close();
	}
}
