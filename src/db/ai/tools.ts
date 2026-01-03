import {
  pgTable,
  varchar,
  timestamp,
  jsonb,
  text,
  index,
} from "drizzle-orm/pg-core";
import { messages } from "./messages";

export const tools = pgTable(
  "tools",
  {
    id: text("id").primaryKey(),

    /**
     * Must link to ASSISTANT message.
     * (Enforce in app-layer: only allow role='assistant' messageId)
     */
    assistantMessageId: text("assistant_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),

    /**
     * Tool call id from AI SDK tool calling can be stored for tracing.
     */
    toolCallId: varchar("tool_call_id", { length: 128 }),

    toolName: varchar("tool_name", { length: 128 }).notNull(),

    /**
     * Tool input args and output result
     */
    toolArgs: jsonb("tool_args").$type<Record<string, unknown>>().notNull(),
    toolResult: jsonb("tool_result").$type<Record<string, unknown>>(),

    /**
     * status tracking
     */
    status: varchar("status", { length: 32 }).notNull().default("success"), // 'pending' | 'success' | 'error'
    error: text("error"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    assistantMsgIdx: index("tools_assistant_message_id_idx").on(
      t.assistantMessageId
    ),
    toolNameIdx: index("tools_tool_name_idx").on(t.toolName),
    toolCallIdIdx: index("tools_tool_call_id_idx").on(t.toolCallId),
    createdAtIdx: index("tools_created_at_idx").on(t.createdAt),
  })
);
