// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { CloseActionMenusOutside } from "../../src/renderer/ui/ActionMenus.js";

describe("Action menus", function ActionMenuTests()
{
	it("keeps only the menu containing the new focus target open", function KeepsActiveMenu()
	{
		const root = document.createElement("div");
		root.innerHTML = `<details class="action-menu" open><summary>First</summary><button>Action</button></details><details class="action-menu" open><summary>Second</summary></details>`;
		const menus = root.querySelectorAll<HTMLDetailsElement>(".action-menu");
		const target = menus[0]?.querySelector("button") ?? null;

		CloseActionMenusOutside(root, target);

		expect(menus[0]?.open).toBe(true);
		expect(menus[1]?.open).toBe(false);
	});

	it("closes every menu when focus leaves the window", function ClosesAllMenus()
	{
		const root = document.createElement("div");
		root.innerHTML = `<details class="action-menu" open><summary>Menu</summary></details>`;
		const menu = root.querySelector<HTMLDetailsElement>(".action-menu")!;

		CloseActionMenusOutside(root, null);

		expect(menu.open).toBe(false);
	});
});
