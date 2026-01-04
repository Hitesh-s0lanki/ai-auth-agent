"use client";

import type { UIMessage } from "ai";

/**
 * Middleware function type for processing streaming text chunks
 *
 * @param text - The text chunk to process
 * @param context - Additional context about the message
 * @returns The transformed text
 */
export type StreamingMiddleware = (
  text: string,
  context: {
    messageId: string;
    role: "user" | "assistant" | "system";
    isStreaming: boolean;
    accumulatedText: string;
  }
) => string | Promise<string>;

/**
 * Applies middleware to transform text parts in UIMessages
 *
 * @param messages - Array of UIMessages to process
 * @param middleware - Array of middleware functions to apply
 * @param isStreaming - Whether the last message is currently streaming
 * @returns Transformed messages
 */
export function applyStreamingMiddleware(
  messages: UIMessage[],
  middleware: StreamingMiddleware[],
  isStreaming: boolean = false
): UIMessage[] {
  if (middleware.length === 0) {
    return messages;
  }

  return messages.map((message, messageIndex) => {
    const isLastMessage = messageIndex === messages.length - 1;
    const messageIsStreaming = isLastMessage && isStreaming;

    // Process each part in the message
    const transformedParts = message.parts.map((part) => {
      // Only process text parts
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        let text = part.text;
        let accumulatedText = text;

        // Apply all middleware functions sequentially
        for (const middlewareFn of middleware) {
          try {
            const context = {
              messageId: message.id,
              role: message.role as "user" | "assistant" | "system",
              isStreaming: messageIsStreaming,
              accumulatedText,
            };

            // Handle both sync and async middleware
            const result = middlewareFn(text, context);
            if (result instanceof Promise) {
              // For async middleware, we'll need to handle it differently
              // For now, we'll use the text as-is and log a warning
              console.warn(
                "Async middleware detected but not fully supported in synchronous context"
              );
              text = text; // Keep original text for now
            } else {
              text = result;
              accumulatedText = text;
            }
          } catch (error) {
            console.error("Error in streaming middleware:", error);
            // Continue with original text if middleware fails
          }
        }

        return {
          ...part,
          text,
        };
      }

      // Handle structured output (object type) - extract result field
      // TypeScript doesn't recognize "object" as a valid part type, so we use type assertion
      const partRecord = part as Record<string, unknown>;
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        partRecord.type === "object" &&
        "object" in partRecord &&
        typeof partRecord.object === "object" &&
        partRecord.object !== null &&
        "result" in partRecord.object &&
        typeof (partRecord.object as { result?: string }).result === "string"
      ) {
        let text = (partRecord.object as { result: string }).result;
        let accumulatedText = text;

        // Apply all middleware functions sequentially
        for (const middlewareFn of middleware) {
          try {
            const context = {
              messageId: message.id,
              role: message.role as "user" | "assistant" | "system",
              isStreaming: messageIsStreaming,
              accumulatedText,
            };

            const result = middlewareFn(text, context);
            if (result instanceof Promise) {
              console.warn(
                "Async middleware detected but not fully supported in synchronous context"
              );
              text = text;
            } else {
              text = result;
              accumulatedText = text;
            }
          } catch (error) {
            console.error("Error in streaming middleware:", error);
          }
        }

        return {
          ...(partRecord as Record<string, unknown>),
          object: {
            ...(partRecord.object as Record<string, unknown>),
            result: text,
          },
        } as unknown as typeof part;
      }

      // Return other part types as-is
      return part;
    });

    return {
      ...message,
      parts: transformedParts,
    };
  });
}
