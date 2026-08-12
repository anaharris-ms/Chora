export class SessionStore
{
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

	public Save<TValue>(key: string, value: TValue): void
	{
		window.sessionStorage.setItem(key, JSON.stringify(value));
	}

	public Remove(key: string): void
	{
		window.sessionStorage.removeItem(key);
	}
}
