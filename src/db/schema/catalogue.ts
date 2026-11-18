import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { id, timestamps, archived } from "./_shared";

/** A price list / catalogue (own, or a supplier's). */
export const catalogues = sqliteTable("catalogues", {
  id: id(),
  name: text("name").notNull(),
  shortCode: text("short_code"),
  description: text("description"),
  supplierId: text("supplier_id"), // contacts.id
  colour: text("colour").notNull().default("#0f766e"),
  status: text("status", { enum: ["Draft", "Published", "Expired", "Archived"] }).notNull().default("Published"),
  effectiveDate: text("effective_date"),
  expiryDate: text("expiry_date"),
  ...timestamps,
});

export const catalogueCategories = sqliteTable("catalogue_categories", {
  id: id(),
  catalogueId: text("catalogue_id").notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** A cost item. When isRecipe, its components live in catalogue_recipe_lines. */
export const catalogueItems = sqliteTable("catalogue_items", {
  id: id(),
  catalogueId: text("catalogue_id").notNull(),
  categoryId: text("category_id"),
  itemCode: text("item_code"),
  description: text("description").notNull(),
  details: text("details"),
  costType: text("cost_type", { enum: ["Material", "Labour", "Equipment", "Subcontractor", "Other"] })
    .notNull()
    .default("Material"),
  uom: text("uom").notNull().default("ea"),
  unitCost: real("unit_cost").notNull().default(0),
  isRecipe: integer("is_recipe", { mode: "boolean" }).notNull().default(false),
  imageUrl: text("image_url"),
  ...archived,
  ...timestamps,
});

/** Component lines of a recipe (assembly) item. */
export const catalogueRecipeLines = sqliteTable("catalogue_recipe_lines", {
  id: id(),
  recipeItemId: text("recipe_item_id").notNull(),
  componentItemId: text("component_item_id"),
  description: text("description").notNull(),
  costType: text("cost_type").notNull().default("Material"),
  uom: text("uom"),
  /** Quantity of component per 1 unit of the recipe. Formula allowed. */
  quantityExpr: text("quantity_expr").notNull().default("1"),
  unitCost: real("unit_cost").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});
