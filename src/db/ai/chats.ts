import { pgTable, varchar, timestamp, index, text } from "drizzle-orm/pg-core";

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    title: varchar("title", { length: 120 }).notNull(),

    // link to user or session
    userId: text("user_id"),
    sessionId: text("session_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("chats_created_at_idx").on(t.createdAt),
  })
);
