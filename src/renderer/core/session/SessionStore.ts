// Reads and writes JSON values in the browser's session storage, tolerating unavailable or corrupt storage.
export class SessionStore
{
	// Reads and parses a stored value, clearing and returning null when it is missing or invalid.
	public Load<TValue>(key: string): TValue | null
	{
		let value: TValue | null = null;

		try
		{
			const stored = window.sessionStorage.getItem(key);
			if (stored !== null) value = JSON.parse(stored) as TValue;
		}
		catch
		{
			window.sessionStorage.removeItem(key);
		}

		return value;
	}

	// Serializes and stores a value under the given key.
	public Save<TValue>(key: string, value: TValue): void
	{
		window.sessionStorage.setItem(key, JSON.stringify(value));
	}

	// Removes a stored value.
	public Remove(key: string): void
	{
		window.sessionStorage.removeItem(key);
	}
}
