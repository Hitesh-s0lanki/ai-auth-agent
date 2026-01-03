"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import axios from "axios";

import { ChatContainer } from "./_components/chat-container";
import { useUpdateChats } from "@/hooks/use-chats";
import type { Chat } from "@/modules/chat/types";

/**
 * Response type for chat creation API
 */
type CreateChatResponse = {
  id: string;
  chat?: Chat;
};

/**
 * Home page component - displays empty chat interface for creating new chats.
 * 
 * When user submits a message:
 * 1. Creates a new chat via POST /api/chat
 * 2. Optimistically adds chat to the sidebar
 * 3. Redirects to the chat page with the message as query param
 */
export default function Page() {
  const router = useRouter();
  const { addChat, invalidate } = useUpdateChats();

  const [input, setInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const text = input.trim();
    if (!text) return;
    if (isCreating) return;

    setInput("");
    setIsCreating(true);

    try {
      // Create chat
      const res = await axios.post<CreateChatResponse>("/api/chat", {
        firstMessage: text,
      });

      const id = res.data?.id;
      if (!id) throw new Error("No chat id returned");

      // Optimistically add it to chat list
      const now = new Date();
      const optimisticChat: Chat & { lastMessage?: string | null } =
        res.data.chat ??
        ({
          id,
          title: "New Chat",
          createdAt: now,
          updatedAt: now,
        } as Chat);

      addChat({
        ...optimisticChat,
        updatedAt: new Date(optimisticChat.updatedAt),
        createdAt: new Date(optimisticChat.createdAt),
        lastMessage: text.slice(0, 50),
      });

      // Keep list in sync
      invalidate();

      // Redirect to chat page with message as query param
      const encodedMessage = encodeURIComponent(text);
      router.push(`/${id}?message=${encodedMessage}`);
    } catch (err) {
      console.error("Create chat failed:", err);
      setInput(text);
      setIsCreating(false);
    }
  };

  return (
    <ChatContainer
      messages={[]}
      input={input}
      setInput={setInput}
      onSubmit={handleSubmit}
      status={isCreating ? "submitted" : "ready"}
      stop={undefined}
      error={null}
    />
  );
}
