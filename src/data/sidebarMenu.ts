/* eslint-disable @typescript-eslint/no-unnecessary-condition */
export const headerMenu = ["Articles", "Projects", "Wiki", "Catalogue", "Settings"] as const;

export type MenuItem = MenuItemLink | MenuItemHeader;

export interface MenuItemLink {
	label: string;
	link: string;
	isCurrent?: boolean;
	type: "link";
}

export interface MenuItemHeader {
	label: string;
	type: "header";
}

type ProcessedNavMenu = { heading: string | undefined; children: MenuItemLink[] }[];

export function processNavMenu(navMenu: MenuItem[]): ProcessedNavMenu {
	const processedNavMenu: ProcessedNavMenu = [];
	if (navMenu && navMenu.length > 0) {
		let committedNav: { heading: string | undefined; children: MenuItemLink[] } | undefined =
			undefined;

		// This could be a reduce... but it'd probably be super unreadable so whatever
		navMenu.forEach((item) => {
			switch (item.type) {
				case "header":
					if (committedNav) {
						processedNavMenu.push(committedNav);
						committedNav = undefined;
					}
					committedNav = { heading: item.label, children: [] };
					break;
				case "link":
					if (committedNav) {
						committedNav.children.push(item);
						break;
					}
					committedNav = { heading: undefined, children: [item] };
					break;
			}
		});

		if (committedNav) {
			processedNavMenu.push(committedNav);
		}
	}

	return processedNavMenu.filter((navItem) => navItem.children.length > 0);
}
