export const headerMenu = ["articles", "projects", "wiki", "catalogue"] as const;

export const blurb =
	'Currently employed at <a class="button-style-bg-accent p-0" href="https://astro.build">Astro</a>. I thrive in high-impact but often overlooked areas, such as editor tooling.';

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

		for (const item of navMenu) {
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
		}

		if (committedNav) {
			processedNavMenu.push(committedNav);
		}
	}

	return processedNavMenu.filter((navItem) => navItem.children.length > 0);
}
