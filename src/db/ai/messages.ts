import {
  pgTable,
  text,
  varchar,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { chats } from "./chats";

// Self-reference is supported by Drizzle but causes TypeScript circular reference warning
// Self-reference is supported by Drizzle but causes TypeScript circular reference warning
// @ts-expect-error - Circular reference in self-referencing foreign key (supported by Drizzle)
export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),

    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),

    /**
     * Role as per AI SDK ModelMessage: system/user/assistant
     * (You can store only user/assistant if you prefer.)
     */
    role: varchar("role", { length: 16 }).notNull(), // 'user' | 'assistant' | 'system'

    /**
     * Plain text/markdown content for user/assistant message.
     * If you later want multi-part content (tool parts, files), keep jsonb below.
     */
    content: text("content").notNull(),

    /**
     * Parent user message linkage:
     * - For assistant messages: set to the user message it answers.
     * - For user messages: keep NULL (unless you add threading/replies).
     */
    userMessageId: text("user_message_id").references(
      (() => messages.id) as () => typeof messages.id,
      { onDelete: "set null" }
    ),

    /**
     * Optional: store raw AI-SDK compatible message payload
     * (parts, tool-call parts, metadata, etc.)
     */
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    chatIdx: index("messages_chat_id_idx").on(t.chatId),
    roleIdx: index("messages_role_idx").on(t.role),
    userMsgIdx: index("messages_user_message_id_idx").on(t.userMessageId),
    createdAtIdx: index("messages_created_at_idx").on(t.createdAt),
  })
);
