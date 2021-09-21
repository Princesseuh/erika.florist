export interface WikiCategory {
    key: string,
    title: string,
    weight: number
}

export const wikiCategories: WikiCategory[] = [
    {
        key: 'computers',
        title: 'Computers',
        weight: 0
    },
    {
        key: 'linux',
        title: 'Linux',
        weight: 1
    },
    {
        key: 'floristry',
        title: 'Floristry',
        weight: 2
    },
    {
        key: 'games',
        title: 'Games',
        weight: 3
    },
    {
        key: 'misc',
        title: 'Misc',
        weight: 4
    },
]

export function getCategory(key: string): WikiCategory {
    return wikiCategories.find(category => {
        category.key === key
    })
}
