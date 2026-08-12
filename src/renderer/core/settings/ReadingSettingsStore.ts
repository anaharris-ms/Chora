// Global appearance preference shared across every renderer surface.
export type Appearance = "light" | "dark";

// Global reading font family shared by the reader and Dream surfaces.
export type ReadingFont = "serif" | "sans";

// Persisted global reading preferences.
interface ReadingPreferences
{
	fontSize: number;
	font: ReadingFont;
	appearance: Appearance;
}

// Owns global reading settings and applies them to the document root as shared CSS variables.
export class ReadingSettingsStore
{
	private static readonly StorageKey = "chora:reading-settings";
	private static readonly SerifStack = `"Iowan Old Style", "Palatino Linotype", Georgia, serif`;
	private static readonly SansStack = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
	private static readonly MinimumFontSize = 14;
	private static readonly MaximumFontSize = 32;
	private preferences: ReadingPreferences = this.Load();

	public GetFontSize(): number
	{
		return this.preferences.fontSize;
	}

	public GetFont(): ReadingFont
	{
		return this.preferences.font;
	}

	public GetAppearance(): Appearance
	{
		return this.preferences.appearance;
	}

	public ChangeFontSize(delta: number): void
	{
		const next = Math.max(ReadingSettingsStore.MinimumFontSize, Math.min(ReadingSettingsStore.MaximumFontSize, this.preferences.fontSize + delta));
		this.preferences.fontSize = next;
		this.Save();
		this.Apply();
	}

	public SetFont(font: ReadingFont): void
	{
		this.preferences.font = font;
		this.Save();
		this.Apply();
	}

	public ToggleAppearance(): void
	{
		this.preferences.appearance = this.preferences.appearance === "light" ? "dark" : "light";
		this.Save();
		this.Apply();
	}

	// Writes the current preferences to the document root for every surface to inherit.
	public Apply(): void
	{
		const root = document.documentElement;
		const stack = this.preferences.font === "sans" ? ReadingSettingsStore.SansStack : ReadingSettingsStore.SerifStack;
		root.style.setProperty("--reading-font-size", `${this.preferences.fontSize}px`);
		root.style.setProperty("--reading-font", stack);
		root.dataset.theme = this.preferences.appearance;
	}

	private Load(): ReadingPreferences
	{
		const preferences: ReadingPreferences = { fontSize: 18, font: "serif", appearance: "light" };

		try
		{
			const stored = window.localStorage.getItem(ReadingSettingsStore.StorageKey);
			if (stored !== null)
			{
				const candidate = JSON.parse(stored) as Partial<ReadingPreferences>;
				if (typeof candidate.fontSize === "number" && candidate.fontSize >= ReadingSettingsStore.MinimumFontSize && candidate.fontSize <= ReadingSettingsStore.MaximumFontSize) preferences.fontSize = candidate.fontSize;
				if (candidate.font === "serif" || candidate.font === "sans") preferences.font = candidate.font;
				if (candidate.appearance === "light" || candidate.appearance === "dark") preferences.appearance = candidate.appearance;
			}
		}
		catch
		{
			// Invalid preferences fall back to the defaults.
		}

		return preferences;
	}

	private Save(): void
	{
		try
		{
			window.localStorage.setItem(ReadingSettingsStore.StorageKey, JSON.stringify(this.preferences));
		}
		catch
		{
			// Settings remain available for the current session when storage is unavailable.
		}
	}
}
