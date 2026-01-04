"use client";

import type { StreamingMiddleware } from "./streaming-middleware";

/**
 * Example middleware: Convert text to uppercase during streaming
 * This is just a demonstration - you probably don't want this in production!
 */
export const uppercaseMiddleware: StreamingMiddleware = (text, context) => {
  // Only apply to assistant messages during streaming
  if (context.role === "assistant" && context.isStreaming) {
    return text.toUpperCase();
  }
  return text;
};

/**
 * Example middleware: Add emoji to the end of streaming text
 */
export const emojiMiddleware: StreamingMiddleware = (text, context) => {
  if (context.role === "assistant" && context.isStreaming) {
    // Only add emoji if text doesn't already end with one
    if (!text.endsWith("✨") && text.trim().length > 0) {
      return text + " ✨";
    }
  }
  return text;
};

/**
 * Example middleware: Replace specific words during streaming
 */
export const wordReplacementMiddleware: StreamingMiddleware = (text, context) => {
  if (context.role === "assistant" && context.isStreaming) {
    // Replace "AI" with "Artificial Intelligence" during streaming
    return text.replace(/\bAI\b/g, "Artificial Intelligence");
  }
  return text;
};

/**
 * Example middleware: Add typing indicators or formatting
 */
export const formattingMiddleware: StreamingMiddleware = (text, context) => {
  if (context.role === "assistant" && context.isStreaming) {
    // You could add markdown formatting, links, etc.
    // This is just an example
    return text;
  }
  return text;
};

/**
 * Example middleware: Filter or sanitize content
 */
export const sanitizeMiddleware: StreamingMiddleware = (text, context) => {
  if (context.role === "assistant" && context.isStreaming) {
    // Remove or replace sensitive information
    // This is just an example
    return text.replace(/password:\s*\S+/gi, "password: [REDACTED]");
  }
  return text;
};

