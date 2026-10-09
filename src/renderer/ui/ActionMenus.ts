// Closes every open action menu except the one containing the active pointer or focus target.
export function CloseActionMenusOutside(root: ParentNode, target: Node | null): void
{
	const menus = root.querySelectorAll<HTMLDetailsElement>(".action-menu[open]");
	for (const menu of Array.from(menus))
	{
		if (target === null || !menu.contains(target)) menu.open = false;
	}
}
