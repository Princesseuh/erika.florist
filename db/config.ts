import { column, defineDb, defineTable } from 'astro:db';

const Cover = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    src: column.text(),
    width: column.number(),
    height: column.number(),
    placeholder: column.text()
  }
});

const Catalogue = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    type: column.text(),
    title: column.text(),
    author: column.text(),
    cover: column.number({ references: () => Cover.columns.id }),
    rating: column.text(),
    finishedDate: column.number({ optional: true }),
    platform: column.text({ optional: true }),
    metadata: column.text()
  }
});

// https://astro.build/db/config
export default defineDb({
  tables: {
    Cover,
    Catalogue
  }
});
