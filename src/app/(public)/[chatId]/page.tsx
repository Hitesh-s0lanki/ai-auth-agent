"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import axios from "axios";

import { ChatContainer } from "../_components/chat-container";
import { AxiosChatTransport } from "@/lib/axios-chat-transport";
import type { ChatRequestBody } from "@/modules/chat/types";
import type { Message } from "@/modules/messages/types";
import { useUpdateChats } from "@/hooks/use-chats";
import { Spinner } from "@/components/ui/spinner";
import {
  applyStreamingMiddleware,
  type StreamingMiddleware,
} from "@/lib/streaming-middleware";
import { useChatFrontendTools } from "@/hooks/use-chat-frontend-tools";
import type { ToolResultContentPart } from "@/modules/tools/types";

/**
 * Chat page component - displays and manages an existing chat session.
 *
 * Features:
 * - Loads chat history from API
 * - Auto-sends first message from query param (for new chats)
 * - Streams AI responses using useChat hook
 * - Updates chat metadata (lastMessage, updatedAt) in sidebar
 * - Handles tool calls and frontend tool call results
 *
 * @returns Chat interface with message history and input
 */
export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const chatId = params.chatId as string;

  const { updateChat } = useUpdateChats();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false);

  // Refs to prevent side effects during initialization
  const isInitializingRef = useRef(false); // Prevents updateChat effects while setting initial messages
  const lastUpdatedRef = useRef<string>(""); // Tracks last updated message to prevent duplicate updates
  const hasLoadedMessagesRef = useRef(false); // Ensures messages are only loaded once

  // Frontend tools for Clerk authentication
  const { tools: frontendTools, CaptchaSlot } = useChatFrontendTools();

  // Track pending tool calls to avoid duplicate executions
  const pendingToolCallsRef = useRef<Set<string>>(new Set());
  // Track which messages we've already processed for tool calls
  const processedMessagesRef = useRef<Set<string>>(new Set());
  const [pendingToolCallRes, setPendingToolCallRes] =
    useState<ToolResultContentPart | null>(null);

  const transport = useMemo(
    () =>
      new AxiosChatTransport({
        api: `/api/chat/${chatId}`,
        body: () => ({
          frontendToolCallRes: pendingToolCallRes,
        } as Partial<ChatRequestBody>),
      }),
    [chatId, pendingToolCallRes]
  );

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    transport,
  });

  /**
   * Define streaming middleware functions
   * Add your middleware functions here to process streaming text
   *
   * Middleware is applied to all streaming text chunks on the client side.
   * Each middleware function receives:
   * - text: The current text chunk
   * - context: { messageId, role, isStreaming, accumulatedText }
   *
   * Example usage:
   * ```ts
   * import { wordReplacementMiddleware } from "@/lib/middleware-examples";
   *
   * const streamingMiddleware: StreamingMiddleware[] = [
   *   wordReplacementMiddleware,
   *   // Add more middleware here
   * ];
   * ```
   *
   * Or define inline:
   * ```ts
   * const customMiddleware: StreamingMiddleware = (text, context) => {
   *   if (context.role === "assistant" && context.isStreaming) {
   *     // Your transformation logic
   *     return text.replace(/pattern/g, "replacement");
   *   }
   *   return text;
   * };
   * ```
   */
  const streamingMiddleware: StreamingMiddleware[] = useMemo(() => {
    // Add your middleware functions here
    // They will be applied in order to each streaming text chunk
    //
    // Example: Import from middleware-examples.ts
    // import { wordReplacementMiddleware, sanitizeMiddleware } from "@/lib/middleware-examples";
    // return [wordReplacementMiddleware, sanitizeMiddleware];

    return [
      // Add your middleware functions here
      // Example inline middleware:
      // (text, context) => {
      //   // Only apply to assistant messages during streaming
      //   if (context.role === "assistant" && context.isStreaming) {
      //     // Your transformation logic here
      //     return text;
      //   }
      //   return text;
      // },
    ];
  }, []);

  // Apply middleware to messages before rendering
  const processedMessages = useMemo(() => {
    const isStreaming = status === "streaming" || status === "submitted";
    return applyStreamingMiddleware(messages, streamingMiddleware, isStreaming);
  }, [messages, streamingMiddleware, status]);

  /**
   * Handle frontend tool calls from streamed messages
   * Detects tool calls in structured output and executes them
   * This runs whenever messages change during streaming
   */
  useEffect(() => {
    // Only process during streaming, not when ready
    if (!frontendTools || status === "ready" || !messages.length) {
      return;
    }

    // Find the last assistant message with structured output
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === "assistant");

    if (!lastAssistantMessage) return;

    // Skip if we've already processed this message
    if (processedMessagesRef.current.has(lastAssistantMessage.id)) {
      return;
    }

    // Check for structured output with frontend_tool_call
    // TypeScript doesn't recognize "object" as a valid part type, so we use type assertion
    let foundToolCall = false;
    for (const part of lastAssistantMessage.parts) {
      const partRecord = part as Record<string, unknown>;
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in partRecord &&
        partRecord.type === "object" &&
        "object" in partRecord &&
        typeof partRecord.object === "object" &&
        partRecord.object !== null
      ) {
        const obj = partRecord.object as Record<string, unknown>;
        const frontendToolCall = obj.frontend_tool_call as
          | {
              tool_name: string;
              tool_args: Record<string, unknown>;
            }
          | null
          | undefined;

        if (frontendToolCall && frontendToolCall.tool_name) {
          foundToolCall = true;
          
          // Create a stable tool call ID based on message and tool name
          const toolCallId = `frontend-${frontendToolCall.tool_name}-${lastAssistantMessage.id}`;

          // Skip if already processing this tool call
          if (pendingToolCallsRef.current.has(toolCallId)) {
            continue;
          }

          pendingToolCallsRef.current.add(toolCallId);

          // Execute the frontend tool asynchronously
          const executeTool = async () => {
            try {
              const toolName = frontendToolCall.tool_name;
              const tool = frontendTools[toolName as keyof typeof frontendTools];

              if (!tool || typeof tool !== "object" || !("execute" in tool)) {
                throw new Error(
                  `Frontend tool "${toolName}" not found. Available tools: ${Object.keys(frontendTools).join(", ")}`
                );
              }

              // Validate and prepare arguments using zod schema if available
              let toolArgs: unknown = frontendToolCall.tool_args;
              if (tool.parameters && "parse" in tool.parameters) {
                try {
                  toolArgs = tool.parameters.parse(frontendToolCall.tool_args);
                } catch (parseErr) {
                  throw new Error(
                    `Invalid arguments for ${toolName}: ${
                      parseErr instanceof Error ? parseErr.message : "Validation failed"
                    }`
                  );
                }
              }

              // Execute the tool
              const result = await tool.execute(toolArgs as never);

              // Format result for API
              const toolResult: ToolResultContentPart = {
                type: "tool-result",
                toolCallId,
                toolName,
                output: {
                  type: "json",
                  value: result,
                },
              };

              setPendingToolCallRes(toolResult);

              // Automatically continue the conversation by sending a continuation message
              // This will trigger the API to process the tool result
              // Use a small delay to ensure state is updated
              setTimeout(() => {
                sendMessage({ text: "continue" });
                // Clear after a delay to ensure it's sent
                setTimeout(() => {
                  setPendingToolCallRes(null);
                  pendingToolCallsRef.current.delete(toolCallId);
                }, 1000);
              }, 200);
            } catch (err) {
              console.error("Frontend tool execution error:", err);

              // Send error result back to API
              const errorMessage =
                err instanceof Error
                  ? err.message
                  : "An unknown error occurred while executing the tool";

              const errorResult: ToolResultContentPart = {
                type: "tool-result",
                toolCallId,
                toolName: frontendToolCall.tool_name,
                output: {
                  type: "text",
                  value: `Error: ${errorMessage}`,
                },
              };

              setPendingToolCallRes(errorResult);

              // Continue conversation with error
              setTimeout(() => {
                sendMessage({ text: "continue" });
                setTimeout(() => {
                  setPendingToolCallRes(null);
                  pendingToolCallsRef.current.delete(toolCallId);
                }, 1000);
              }, 200);
            }
          };

          // Execute immediately
          void executeTool();
        }
      }
    }

    // Mark message as processed if we found a tool call or if there's no tool call
    if (lastAssistantMessage && (foundToolCall || lastAssistantMessage.parts.length > 0)) {
      processedMessagesRef.current.add(lastAssistantMessage.id);
    }
  }, [messages, frontendTools, status, sendMessage]);

  /**
   * Load chat message history from API.
   * Skips loading if there's a first message in query params (new chat scenario).
   */
  useEffect(() => {
    if (hasLoadedMessagesRef.current) return;

    const firstMessage = searchParams.get("message");
    if (firstMessage) {
      // For new chats with first message, don't load messages - let useChat handle the optimistic update
      setIsLoading(false);
      hasLoadedMessagesRef.current = true;
      return;
    }

    const load = async () => {
      try {
        setIsLoading(true);

        const res = await axios.get<
          Array<
            Message & {
              parts: UIMessage["parts"];
            }
          >
        >(`/api/chat/${chatId}/messages`);

        const uiMessages: UIMessage[] = (res.data ?? [])
          .filter((m) => m.role !== "tool")
          .map((m) => ({
            id: m.id,
            role: m.role as "system" | "user" | "assistant",
            parts: m.parts as UIMessage["parts"],
          }));

        isInitializingRef.current = true;
        setMessages(uiMessages);
        queueMicrotask(() => {
          isInitializingRef.current = false;
        });
        hasLoadedMessagesRef.current = true;
      } catch (err) {
        console.error("Load chat failed:", err);
        if (
          axios.isAxiosError(err) &&
          (err.response?.status === 403 || err.response?.status === 404)
        ) {
          router.replace("/");
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (chatId) load();
  }, [chatId, router, setMessages, searchParams]);

  /**
   * Auto-send first message from URL query parameter.
   * This is used when creating a new chat from the home page.
   */
  useEffect(() => {
    if (!chatId) return;
    if (isLoading) return;
    if (hasSentFirstMessage) return;
    if (status !== "ready") return;

    const firstMessage = searchParams.get("message");
    if (!firstMessage) return;

    const decodedMessage = decodeURIComponent(firstMessage);
    if (!decodedMessage.trim()) return;

    setHasSentFirstMessage(true);
    sendMessage({ text: decodedMessage });

    // Clean up URL by removing the message param
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.delete("message");
    const newSearch = newSearchParams.toString();
    const newUrl = newSearch ? `/${chatId}?${newSearch}` : `/${chatId}`;
    router.replace(newUrl, { scroll: false });
  }, [
    chatId,
    isLoading,
    hasSentFirstMessage,
    status,
    searchParams,
    sendMessage,
    router,
  ]);

  /**
   * Update chat metadata (lastMessage, updatedAt) in sidebar when messages change.
   * Uses deduplication to prevent unnecessary updates.
   * Note: Uses processedMessages to get the final text after middleware
   */
  useEffect(() => {
    if (!chatId) return;
    if (isInitializingRef.current) return;
    if (processedMessages.length === 0) return;

    const last = processedMessages[processedMessages.length - 1];
    const textPart = last.parts.find((p) => p.type === "text");
    const lastText = textPart && "text" in textPart ? textPart.text : "";
    const key = `${last.id}:${lastText.slice(0, 60)}`;

    if (key === lastUpdatedRef.current) return;
    lastUpdatedRef.current = key;

    const t = setTimeout(() => {
      updateChat(chatId, {
        lastMessage: lastText.slice(0, 50),
        updatedAt: new Date(),
      });
    }, 150);

    return () => clearTimeout(t);
  }, [chatId, processedMessages, updateChat]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const text = input.trim();
    if (!text) return;
    if (status !== "ready") return;

    setInput("");
    sendMessage({ text });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="size-8 text-primary" />
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              Loading chat...
            </p>
            <p className="text-xs text-muted-foreground">
              Please wait while we fetch your messages
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <CaptchaSlot />
      <ChatContainer
        messages={processedMessages}
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        status={status}
        stop={stop}
        error={error}
      />
    </>
  );
}
