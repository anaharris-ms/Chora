// Owns one reusable modal overlay and its caller-supplied body content.
export class PopupPanel
{
	// Contains the persistent modal overlay.
	private readonly overlay: HTMLElement;
	// Contains caller-supplied popup content.
	private readonly body: HTMLElement;
	// Handles backdrop clicks for the popup lifetime.
	private readonly overlayClickHandler: (event: MouseEvent) => void;
	// Handles the close button for the popup lifetime.
	private readonly closeClickHandler: () => void;
	// Tracks whether the popup is visible.
	private isOpen = false;

	// Creates and mounts one titled modal popup beneath the document body.
	public constructor(title: string)
	{
		this.overlayClickHandler = this.HandleOverlayClick.bind(this);
		this.closeClickHandler = this.Close.bind(this);
		this.overlay = document.createElement("div");
		this.overlay.className = "popup-overlay";
		this.overlay.hidden = true;
		this.overlay.addEventListener("click", this.overlayClickHandler);

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
		closeButton.addEventListener("click", this.closeClickHandler);
		header.append(heading, closeButton);

		this.body = document.createElement("div");
		this.body.className = "popup-body";
		dialog.append(header, this.body);
		this.overlay.appendChild(dialog);
		document.body.appendChild(this.overlay);
	}

	// Reports whether the popup is visible.
	public get IsOpen(): boolean
	{
		const isOpen = this.isOpen;

		return isOpen;
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

	// Replaces all popup body markup.
	public SetBodyHtml(html: string): void
	{
		this.body.innerHTML = html;
	}

	// Registers delegated click handling within the popup body.
	public OnBodyClick(handler: (event: MouseEvent) => void): void
	{
		this.body.addEventListener("click", handler);
	}

	// Registers delegated form submission handling within the popup body.
	public OnBodySubmit(handler: (event: Event) => void): void
	{
		this.body.addEventListener("submit", handler);
	}

	// Registers delegated keyboard handling within the popup body.
	public OnBodyKeyDown(handler: (event: KeyboardEvent) => void): void
	{
		this.body.addEventListener("keydown", handler);
	}

	// Refreshes one body section without replacing unrelated inputs.
	public SetSectionHtml(selector: string, html: string): void
	{
		const section = this.body.querySelector<HTMLElement>(selector);

		if (section !== null)
		{
			section.innerHTML = html;
		}
	}

	// Removes the popup and its owned root listeners.
	public Dispose(): void
	{
		this.overlay.removeEventListener("click", this.overlayClickHandler);
		this.overlay.remove();
	}

	// Closes the popup when the reader clicks the backdrop itself.
	private HandleOverlayClick(event: MouseEvent): void
	{
		if (event.target === this.overlay)
		{
			this.Close();
		}
	}
}
