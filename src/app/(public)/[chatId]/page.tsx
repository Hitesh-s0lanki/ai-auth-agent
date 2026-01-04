"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { generateToolCallId } from "@/lib/tool-call-id";

// ─────────────────────────────────────────────────────────────
// Type guards
type TextUIPart = { type: "text"; text: string };

function isTextPart(part: unknown): part is TextUIPart {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part as { type: unknown }).type === "text" &&
    "text" in part &&
    typeof (part as { text: unknown }).text === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type Structured = {
  result?: string;
  frontend_tool_call?: {
    tool_name: string;
    tool_args: Record<string, unknown>;
  } | null;
};

function extractStructuredFromAssistant(msg: UIMessage): Structured | null {
  // 1) Prefer structured parts
  for (const part of msg.parts) {
    const partRecord = part as Record<string, unknown>;

    if (partRecord.type === "data" && "data" in partRecord) {
      const data = partRecord.data;
      if (isRecord(data)) return data as Structured;
    }

    if (partRecord.type === "object" && "object" in partRecord) {
      const obj = partRecord.object;
      if (isRecord(obj)) return obj as Structured;
    }
  }

  // 2) Fallback: parse JSON from text
  const textPart = msg.parts.find(isTextPart);
  const raw = textPart?.text ?? "";
  const trimmed = String(raw).trim();
  if (!trimmed.includes("{")) return null;

  let startIdx = 0;
  let firstValid: Structured | null = null;

  while (startIdx < trimmed.length) {
    const braceStart = trimmed.indexOf("{", startIdx);
    if (braceStart === -1) break;

    let braceCount = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < trimmed.length; i++) {
      if (trimmed[i] === "{") braceCount++;
      if (trimmed[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          braceEnd = i;
          break;
        }
      }
    }
    if (braceEnd === -1) break;

    try {
      const jsonStr = trimmed.slice(braceStart, braceEnd + 1);
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === "object") {
        const typed = parsed as Structured;
        if (typed.frontend_tool_call) return typed;
        if (!firstValid) firstValid = typed;
      }
    } catch {
      // continue
    }

    startIdx = braceEnd + 1;
  }

  return firstValid;
}

// ─────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const chatId = params.chatId as string;

  const { updateChat } = useUpdateChats();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false);

  const isInitializingRef = useRef(false);
  const lastUpdatedRef = useRef<string>("");
  const hasLoadedMessagesRef = useRef(false);

  const { tools: frontendTools, CaptchaSlot } = useChatFrontendTools();

  // Tool execution tracking
  const processedAssistantIdsRef = useRef<Set<string>>(new Set()); // assistant ids already handled
  const processedAssistantContentRef = useRef<Set<string>>(new Set()); // assistant content hashes already handled
  const inFlightToolForAssistantRef = useRef<string | null>(null); // avoid multiple exec while streaming updates
  const pendingToolCallResRef = useRef<ToolResultContentPart | null>(null);
  const isSendingToolResultRef = useRef(false);

  // ✅ Hide internal "continue" user messages
  const hideNextContinueRef = useRef(false);
  const hiddenUserMessageIdsRef = useRef<Set<string>>(new Set());

  // ✅ Gate: allow auto tool execution only if we *just streamed* in this tab
  const lastStatusRef = useRef<string>("ready");

  // ✅ A "tool continuation" should only ever send once per tool call id
  const sentContinuationForToolCallRef = useRef<Set<string>>(new Set());

  const transport = useMemo(
    () =>
      new AxiosChatTransport({
        api: `/api/chat/${chatId}`,
        body: () => {
          return {
            frontendToolCallRes: pendingToolCallResRef.current,
          } as Partial<ChatRequestBody>;
        },
      }),
    [chatId]
  );

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    transport,
  });

  const streamingMiddleware: StreamingMiddleware[] = useMemo(() => [], []);

  // Apply middleware and also filter hidden internal messages
  const processedMessages = useMemo(() => {
    const isStreaming = status === "streaming" || status === "submitted";
    const afterMiddleware = applyStreamingMiddleware(
      messages,
      streamingMiddleware,
      isStreaming
    );

    // ✅ Filter internal continue messages by id
    const withoutHidden = afterMiddleware.filter(
      (m) => !hiddenUserMessageIdsRef.current.has(m.id)
    );

    // ✅ Deduplicate messages: by ID first, then by content for assistant messages
    const seenIds = new Set<string>();
    const seenContentHashes = new Set<string>();
    const deduplicated: UIMessage[] = [];

    for (const msg of withoutHidden) {
      // Always deduplicate by ID
      if (seenIds.has(msg.id)) {
        continue;
      }
      seenIds.add(msg.id);

      // For assistant messages, also deduplicate by content to catch duplicates with different IDs
      if (msg.role === "assistant") {
        const textPart = msg.parts.find(isTextPart);
        const content = textPart?.text ?? "";
        const contentHash = `${msg.role}:${content.slice(0, 200)}`; // Use first 200 chars as hash

        if (seenContentHashes.has(contentHash)) {
          continue;
        }
        seenContentHashes.add(contentHash);
      }

      deduplicated.push(msg);
    }

    return deduplicated;
  }, [messages, streamingMiddleware, status]);

  // Detect the next user message id for "continue" and hide it
  useEffect(() => {
    if (!hideNextContinueRef.current) return;
    if (!messages.length) return;

    const last = messages[messages.length - 1];
    if (last.role !== "user") return;

    const textPart = last.parts.find(isTextPart);
    const text = (textPart?.text ?? "").trim();

    if (text === "__internal_continue__") {
      hiddenUserMessageIdsRef.current.add(last.id);
      hideNextContinueRef.current = false;
    }
  }, [messages]);

  const executeFrontendToolCall = useCallback(
    async (opts: {
      assistantMessageId: string;
      toolName: string;
      toolArgs: Record<string, unknown>;
    }) => {
      if (!frontendTools) throw new Error("frontendTools not loaded");

      const { assistantMessageId, toolName, toolArgs } = opts;

      const tool = frontendTools[toolName as keyof typeof frontendTools];
      if (!tool || typeof tool !== "object" || !("execute" in tool)) {
        throw new Error(
          `Frontend tool "${toolName}" not found. Available tools: ${Object.keys(
            frontendTools
          ).join(", ")}`
        );
      }

      let finalArgs: unknown = toolArgs;

      type ToolWithParameters = {
        parameters?: { parse: (args: unknown) => unknown };
        execute: (args: never) => Promise<unknown>;
      };

      const toolWithParams = tool as ToolWithParameters;
      if (toolWithParams?.parameters?.parse) {
        finalArgs = toolWithParams.parameters.parse(toolArgs);
      }

      const toolCallId = generateToolCallId(
        "frontend",
        toolName,
        assistantMessageId
      );

      // ✅ Ensure we do not send the continuation multiple times for the same tool call
      if (sentContinuationForToolCallRef.current.has(toolCallId)) return;
      sentContinuationForToolCallRef.current.add(toolCallId);

      const result = await toolWithParams.execute(finalArgs as never);

      const toolResult: ToolResultContentPart = {
        type: "tool-result",
        toolCallId,
        toolName,
        output: { type: "json", value: result },
      };

      // Send tool result in next request
      pendingToolCallResRef.current = toolResult;
      isSendingToolResultRef.current = true;

      // ✅ Hide the internal continue message in UI
      hideNextContinueRef.current = true;

      // Use a special internal marker text (not "continue") and hide it
      sendMessage({ text: "__internal_continue__" });

      // Cleanup
      setTimeout(() => {
        pendingToolCallResRef.current = null;
        isSendingToolResultRef.current = false;
        inFlightToolForAssistantRef.current = null;
      }, 500);
    },
    [frontendTools, sendMessage]
  );

  /**
   * ✅ Auto-run frontend_tool_call ONLY for live-streaming in this tab.
   * - Allowed during streaming/submitted, OR immediately when streaming just finished.
   * - Not allowed on refresh (ready → ready)
   */
  useEffect(() => {
    if (!frontendTools || !messages.length) {
      lastStatusRef.current = status;
      return;
    }
    if (isSendingToolResultRef.current) {
      lastStatusRef.current = status;
      return;
    }

    const prev = lastStatusRef.current;
    const isLive = status === "streaming" || status === "submitted";
    const justFinished =
      (prev === "streaming" || prev === "submitted") && status === "ready";

    const canAutoRun = isLive || justFinished;

    // ✅ Prevent refresh from running tools (ready -> ready)
    if (!canAutoRun) {
      lastStatusRef.current = status;
      return;
    }

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) {
      lastStatusRef.current = status;
      return;
    }

    // ✅ Already handled this assistant message by ID
    if (processedAssistantIdsRef.current.has(lastAssistant.id)) {
      lastStatusRef.current = status;
      return;
    }

    // ✅ Also check by content hash to prevent duplicate processing of same content with different IDs
    const textPart = lastAssistant.parts.find(isTextPart);
    const content = textPart?.text ?? "";
    const contentHash = `${lastAssistant.role}:${content.slice(0, 200)}`;
    if (processedAssistantContentRef.current.has(contentHash)) {
      lastStatusRef.current = status;
      return;
    }

    // ✅ Avoid re-entry while parts are still changing rapidly during stream
    if (inFlightToolForAssistantRef.current === lastAssistant.id) {
      lastStatusRef.current = status;
      return;
    }

    const structured = extractStructuredFromAssistant(lastAssistant);
    const ftc = structured?.frontend_tool_call ?? null;

    if (!ftc?.tool_name) {
      // Only mark as processed after stream finishes
      if (status === "ready") {
        processedAssistantIdsRef.current.add(lastAssistant.id);
        processedAssistantContentRef.current.add(contentHash);
      }
      lastStatusRef.current = status;
      return;
    }

    // ✅ We have a tool call. Execute exactly once.
    inFlightToolForAssistantRef.current = lastAssistant.id;
    processedAssistantIdsRef.current.add(lastAssistant.id);
    processedAssistantContentRef.current.add(contentHash);

    void executeFrontendToolCall({
      assistantMessageId: lastAssistant.id,
      toolName: ftc.tool_name,
      toolArgs: ftc.tool_args,
    }).catch((err) => {
      console.error("[Frontend Tools] execution failed:", err);
      inFlightToolForAssistantRef.current = null;
    });

    lastStatusRef.current = status;
  }, [
    messages,
    frontendTools,
    status,
    sendMessage,
    processedAssistantIdsRef,
    inFlightToolForAssistantRef,
    lastStatusRef,
    executeFrontendToolCall,
  ]);

  /**
   * Load chat history from API.
   * Note: We DO NOT auto-run tool calls on load (refresh-safe).
   */
  useEffect(() => {
    if (hasLoadedMessagesRef.current) return;

    const firstMessage = searchParams.get("message");
    if (firstMessage) {
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

    if (chatId) void load();
  }, [chatId, router, setMessages, searchParams]);

  /**
   * Auto-send first message from URL query param.
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
   * Update sidebar metadata
   */
  useEffect(() => {
    if (!chatId) return;
    if (isInitializingRef.current) return;
    if (processedMessages.length === 0) return;

    const last = processedMessages[processedMessages.length - 1];
    const textPart = last.parts.find(isTextPart);
    const lastText = textPart?.text ?? "";
    const key = `${last.id}:${String(lastText).slice(0, 60)}`;

    if (key === lastUpdatedRef.current) return;
    lastUpdatedRef.current = key;

    const t = setTimeout(() => {
      updateChat(chatId, {
        lastMessage: String(lastText).slice(0, 50),
        updatedAt: new Date(),
      });
    }, 150);

    return () => clearTimeout(t);
  }, [chatId, processedMessages, updateChat]);

  /**
   * User submit.
   * Also blocks sending while tool continuation is in progress to prevent double-post storms.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (status !== "ready") return;
    if (isSendingToolResultRef.current) return; // ✅ prevent spam during tool continuation

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
