export interface WikiCategory {
  key: string;
  title: string;
}

export const wikiCategories: WikiCategory[] = [
  {
    key: "computers",
    title: "Computers",
  },
  {
    key: "linux",
    title: "Linux",
  },
  {
    key: "floristry",
    title: "Floristry",
  },
  {
    key: "games",
    title: "Games",
  },
  {
    key: "misc",
    title: "Misc",
  },
];

export function getCategory(key: string): WikiCategory | undefined {
  return wikiCategories.find((category) => {
    category.key === key;
  });
}
