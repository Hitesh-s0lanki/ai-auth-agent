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

  const transport = useMemo(
    () =>
      new AxiosChatTransport({
        api: `/api/chat/${chatId}`,
        body: () => ({ frontendToolCallRes: null } as Partial<ChatRequestBody>),
      }),
    [chatId]
  );

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    transport,
  });

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
   */
  useEffect(() => {
    if (!chatId) return;
    if (isInitializingRef.current) return;
    if (messages.length === 0) return;

    const last = messages[messages.length - 1];
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
  }, [chatId, messages, updateChat]);

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
            <p className="text-sm font-medium text-foreground">Loading chat...</p>
            <p className="text-xs text-muted-foreground">Please wait while we fetch your messages</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ChatContainer
      messages={messages}
      input={input}
      setInput={setInput}
      onSubmit={handleSubmit}
      status={status}
      stop={stop}
      error={error}
    />
  );
}
