import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStore } from "../../src/renderer/core/session/SessionStore.js";

class TestStorage
{
	private readonly values = new Map<string, string>();

	public getItem(key: string): string | null
	{
		return this.values.get(key) ?? null;
	}

	public setItem(key: string, value: string): void
	{
		this.values.set(key, value);
	}

	public removeItem(key: string): void
	{
		this.values.delete(key);
	}
}

describe("SessionStore", function SessionStoreTests()
{
	let storage: TestStorage;

	beforeEach(() =>
	{
		storage = new TestStorage();
		vi.stubGlobal("window", { sessionStorage: storage });
	});

	it("round trips typed session values", function RoundTripsValues()
	{
		const sessions = new SessionStore();
		const value = { dreamId: "dream-1", isDirty: true };

		sessions.Save("active-dream", value);

		expect(sessions.Load<typeof value>("active-dream")).toEqual(value);
	});

	it("removes corrupt JSON and returns null", function RemovesCorruptValues()
	{
		const sessions = new SessionStore();
		storage.setItem("active-dream", "{broken");

		const value = sessions.Load("active-dream");

		expect(value).toBeNull();
		expect(storage.getItem("active-dream")).toBeNull();
	});

	it("removes stored values explicitly", function RemovesValues()
	{
		const sessions = new SessionStore();
		sessions.Save("chat", { message: "hello" });

		sessions.Remove("chat");

		expect(sessions.Load("chat")).toBeNull();
	});
});
