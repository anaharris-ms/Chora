import { describe, expect, it } from "vitest";
import { ChoraEventBus } from "../../src/renderer/core/events/ChoraEventBus.js";

interface TestEvents
{
	"dream.opened": { dreamId: string };
	"dream.closed": Record<string, never>;
}

describe("ChoraEventBus", function ChoraEventBusTests()
{
	it("publishes typed events to every subscriber and supports unsubscription", async function PublishesAndUnsubscribes()
	{
		const events = new ChoraEventBus<TestEvents>();
		const received: string[] = [];
		const unsubscribe = events.Subscribe("dream.opened", (event) =>
		{
			received.push(event.dreamId);
		});

		await events.PublishAsync("dream.opened", { dreamId: "dream-1" });
		unsubscribe();
		await events.PublishAsync("dream.opened", { dreamId: "dream-2" });

		expect(received).toEqual(["dream-1"]);
	});

	it("continues delivery and reports a subscriber failure", async function IsolatesSubscriberFailures()
	{
		const events = new ChoraEventBus<TestEvents>();
		const received: string[] = [];
		const failures: string[] = [];
		events.SetErrorHandler((failure) =>
		{
			failures.push(String(failure.eventName));
		});
		events.Subscribe("dream.opened", () =>
		{
			throw new Error("Broken subscriber");
		});
		events.Subscribe("dream.opened", (event) =>
		{
			received.push(event.dreamId);
		});

		await events.PublishAsync("dream.opened", { dreamId: "dream-1" });

		expect(received).toEqual(["dream-1"]);
		expect(failures).toEqual(["dream.opened"]);
	});

	it("does not recurse when the failure reporter publishes another failing event", async function PreventsFailureRecursion()
	{
		const events = new ChoraEventBus<TestEvents>();
		let reports = 0;
		events.Subscribe("dream.closed", () =>
		{
			throw new Error("Failure reporter subscriber failed");
		});
		events.Subscribe("dream.opened", () =>
		{
			throw new Error("Original failure");
		});
		events.SetErrorHandler(async () =>
		{
			reports += 1;
			await events.PublishAsync("dream.closed", {});
		});

		await events.PublishAsync("dream.opened", { dreamId: "dream-1" });

		expect(reports).toBe(1);
	});
});
