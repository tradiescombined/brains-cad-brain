import { text, integer } from "drizzle-orm/sqlite-core";

/** Primary key: random UUID string. */
export const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** created/updated timestamps stored as ISO strings. */
export const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdateFn(() => new Date().toISOString()),
};

/** Soft delete flag. */
export const archived = {
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
};
