export const headerMenu = ["Projects", "Articles", "Wiki", "Catalogue"] as const;

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
