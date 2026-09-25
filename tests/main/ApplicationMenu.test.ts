import { describe, expect, it, vi } from "vitest";
import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { CreateApplicationMenu } from "../../src/main/shell/ApplicationMenu.js";

vi.mock("electron", function MockElectron()
{
	return { Menu: { buildFromTemplate: vi.fn() }, dialog: {} };
});

describe("Application menu", function ApplicationMenuTests(): void
{
	it("keeps external text opening without duplicating the reader work selector", function KeepsExternalTextOpening(): void
	{
		const send = vi.fn();
		const window = { webContents: { send } } as unknown as BrowserWindow;
		const windows = { GetWindow: function GetWindow(): BrowserWindow { return window; } };
		CreateApplicationMenu(windows, [{ id: "republic", title: "Republic", titleGreek: null, urn: null, author: "Plato", language: "grc", editor: null, fileName: "republic.json" }]);
		const template = vi.mocked(Menu.buildFromTemplate).mock.lastCall?.[0] ?? [];
		const file = template.find(function FindFile(item): boolean { return item.label === "File"; });
		const commands = file?.submenu as MenuItemConstructorOptions[];
		const choose = commands.find(function FindChoose(item): boolean { return item.label === "Choose Text"; });
		expect(choose).toBeUndefined();
		expect(commands.some(function HasOpenText(item): boolean { return item.label === "Open Text..."; })).toBe(true);
	});
});