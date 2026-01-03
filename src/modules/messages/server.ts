"use server";

import { db, messages as messagesTable, tools as toolsTable } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { verifyChatOwnership } from "@/modules/chat/server";
import { SaveMessageResult, GetChatMessagesResult, Message } from "./types";

/**
 * Helper to extract text from message parts
 * Note: This is async because it's exported from a "use server" file
 */
export async function getMessageText(
  parts?: Array<{ type?: string; text?: string }>
): Promise<string> {
  if (!parts) return "";
  const textPart = parts.find((part) => part.type === "text" && "text" in part);
  return textPart && "text" in textPart ? textPart.text || "" : "";
}

/**
 * Server action to save a message
 * @param chatId - The ID of the chat
 * @param role - The role of the message (user, assistant, system, tool)
 * @param content - The text content of the message
 * @param parts - Optional message parts (for UI compatibility, includes tool outputs)
 * @param userMessageId - Optional reference to parent user message
 * @returns Saved message or error
 */
export async function saveMessage(
  chatId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  parts?: Array<{ type: string; text?: string; [key: string]: unknown }>,
  userMessageId?: string | null
): Promise<SaveMessageResult> {
  try {
    if (!chatId) {
      return {
        success: false,
        error: "chatId is required",
      };
    }

    if (!content) {
      return {
        success: false,
        error: "content is required",
      };
    }

    const messageId = randomUUID();

    // Store parts in raw field for UI compatibility
    // This includes tool calls and tool results
    const raw: Record<string, unknown> = {};
    if (parts) {
      raw.parts = parts;
    }

    const savedMessages = await db
      .insert(messagesTable)
      .values({
        id: messageId,
        chatId,
        role,
        content,
        userMessageId: userMessageId || null,
        raw,
      })
      .returning();

    if (!Array.isArray(savedMessages) || savedMessages.length === 0) {
      return {
        success: false,
        error: "Failed to save message",
      };
    }

    const savedMessage = savedMessages[0];

    return {
      success: true,
      data: savedMessage,
    };
  } catch (error) {
    console.error("Error saving message:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save message",
    };
  }
}

/**
 * Server action to get all messages for a chat
 * @param chatId - The ID of the chat
 * @param userId - Optional user ID (for authenticated users)
 * @param sessionId - Optional session ID (for unauthenticated users)
 * @returns Messages array with parts (including tool outputs) or error
 */
export async function getChatMessages(
  chatId: string,
  userId?: string | null,
  sessionId?: string | null
): Promise<GetChatMessagesResult> {
  try {
    // Ensure we have either userId or sessionId
    if (!userId && !sessionId) {
      return {
        success: false,
        error: "Unauthorized - no user or session",
      };
    }

    if (!chatId) {
      return {
        success: false,
        error: "chatId is required",
      };
    }

    // First verify chat ownership
    const verifyResult = await verifyChatOwnership(chatId, userId, sessionId);
    if (!verifyResult.success) {
      return {
        success: false,
        error: verifyResult.error,
      };
    }

    // Fetch all messages for the chat, ordered by creation time
    const chatMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.chatId, chatId))
      .orderBy(messagesTable.createdAt);

    // Fetch all tools for assistant messages in this chat
    const assistantMessageIds = chatMessages
      .filter((msg) => msg.role === "assistant")
      .map((msg) => msg.id);

    const toolsByMessageId: Map<
      string,
      Array<{
        toolCallId: string | null;
        toolName: string;
        toolArgs: Record<string, unknown>;
        toolResult: Record<string, unknown> | null;
        status: string;
        error: string | null;
      }>
    > = new Map();

    if (assistantMessageIds.length > 0) {
      const tools = await db
        .select()
        .from(toolsTable)
        .where(inArray(toolsTable.assistantMessageId, assistantMessageIds))
        .orderBy(toolsTable.createdAt);

      // Group tools by assistantMessageId
      for (const tool of tools) {
        const existing = toolsByMessageId.get(tool.assistantMessageId) || [];
        existing.push({
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          toolArgs: tool.toolArgs,
          toolResult: tool.toolResult,
          status: tool.status,
          error: tool.error,
        });
        toolsByMessageId.set(tool.assistantMessageId, existing);
      }
    }

    // Convert messages to include parts from raw field and tools
    const messagesWithParts: Array<
      Message & {
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
      }
    > = chatMessages.map((msg) => {
      // Get parts from raw field, or construct from content
      const raw = msg.raw as {
        parts?: Array<{
          type: string;
          text?: string;
          toolCallId?: string;
          toolName?: string;
          toolResult?: unknown;
          [key: string]: unknown;
        }>;
      } | null;

      let parts: Array<{
        type: string;
        text?: string;
        [key: string]: unknown;
      }>;

      if (raw?.parts && Array.isArray(raw.parts)) {
        // Use parts from raw, ensuring text is included
        parts = raw.parts.map((part) => {
          // Handle structured output (object type) - extract only the result field
          if (
            part.type === "object" &&
            typeof part === "object" &&
            part !== null
          ) {
            const objPart = part as { object?: { result?: string } };
            const resultText = objPart.object?.result;
            if (resultText) {
              // Convert structured output to text part with only the result
              return {
                type: "text",
                text: resultText,
              };
            }
          }

          // If it's a text part, ensure text is set
          if (part.type === "text") {
            return {
              ...part,
              text: part.text || msg.content || "",
            };
          }
          // For tool parts (tool-call, tool-result), include all properties
          return part;
        });

        // If no text part exists but we have content, add it
        const hasTextPart = parts.some((p) => p.type === "text");
        if (!hasTextPart && msg.content) {
          parts.unshift({ type: "text", text: msg.content });
        }
      } else {
        // No parts in raw, create from content (which should already be just the result)
        parts = [{ type: "text", text: msg.content || "" }];
      }

      // For assistant messages, add tool information from tools table
      if (msg.role === "assistant") {
        const toolsForMessage = toolsByMessageId.get(msg.id) || [];

        // Check if tool parts already exist in parts array (AI SDK format: tool-${toolName})
        const existingToolCallIds = new Set(
          parts
            .filter((p) => {
              if (typeof p.type === "string" && p.type.startsWith("tool-")) {
                const partRecord = p as Record<string, unknown>;
                return typeof partRecord.toolCallId === "string";
              }
              return false;
            })
            .map((p) => {
              const partRecord = p as Record<string, unknown>;
              return partRecord.toolCallId as string;
            })
        );

        // Add tool parts in AI SDK format for each tool that doesn't already exist
        const toolParts: Array<{ type: string; [key: string]: unknown }> = [];

        for (const tool of toolsForMessage) {
          // Generate toolCallId if missing (required by UI)
          const toolCallId =
            tool.toolCallId || `tool-${tool.toolName}-${msg.id}-${Date.now()}`;

          // Only add if not already present (by toolCallId)
          const shouldAdd = !existingToolCallIds.has(toolCallId);

          if (shouldAdd) {
            // Determine state based on tool status
            const state =
              tool.status === "error"
                ? "output-error"
                : tool.toolResult
                ? "output-available"
                : "input-available";

            // Create tool part in AI SDK format: type is "tool-${toolName}"
            const toolPart: {
              type: string;
              toolCallId: string;
              state: string;
              input?: unknown;
              output?: unknown;
              errorText?: string;
            } = {
              type: `tool-${tool.toolName}`,
              toolCallId,
              state,
              input: tool.toolArgs,
            };

            // Add output if available
            if (tool.toolResult) {
              toolPart.output = tool.toolResult;
            }

            // Add error text if error occurred
            if (tool.error) {
              toolPart.errorText = tool.error;
            }

            toolParts.push(toolPart);
          }
        }

        // Insert tool parts before text parts (tools should come before text)
        if (toolParts.length > 0) {
          const textPartIndex = parts.findIndex((p) => p.type === "text");
          if (textPartIndex >= 0) {
            parts.splice(textPartIndex, 0, ...toolParts);
          } else {
            // If no text part, prepend tool parts
            parts.unshift(...toolParts);
          }
        }
      }

      return {
        id: msg.id,
        chatId: msg.chatId,
        role: msg.role as "user" | "assistant" | "system" | "tool",
        content: msg.content,
        userMessageId: msg.userMessageId,
        raw: msg.raw as Record<string, unknown>,
        createdAt: msg.createdAt,
        parts,
      };
    });

    return {
      success: true,
      data: messagesWithParts,
    };
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch chat messages",
    };
  }
}
