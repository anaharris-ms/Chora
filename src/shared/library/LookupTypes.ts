// Serializable state of the isolated dictionary panel.
export interface LookupState
{
	readonly open: boolean;
	readonly url: string;
	readonly loading: boolean;
	readonly canGoBack: boolean;
	readonly canGoForward: boolean;
	readonly error: string | null;
}

// Dictionary viewport bounds in renderer CSS pixels; null hides the native view.
export interface LookupBounds
{
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

// Commands supported by the dictionary toolbar.
export type LookupCommand = "back" | "forward" | "reload" | "external" | "close";