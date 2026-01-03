import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import axios from "axios";
import type { Chat } from "@/modules/chat/types";

/**
 * Extended chat type that includes the last message preview
 */
export interface ChatWithLastMessage extends Chat {
  lastMessage?: string | null;
}

/**
 * Fetches all chats from the API and normalizes date fields
 * @returns Array of chats with normalized dates
 */
async function fetchChats(): Promise<ChatWithLastMessage[]> {
  const res = await axios.get<ChatWithLastMessage[]>("/api/chats");

  // Normalize date fields safely
  return (res.data ?? []).map((chat) => ({
    ...chat,
    updatedAt: new Date(chat.updatedAt),
    createdAt: new Date(chat.createdAt),
    lastMessage: chat.lastMessage ?? null,
  }));
}

/**
 * React Query hook to fetch and manage the list of chats.
 * 
 * Features:
 * - Caches results for 10 seconds
 * - Does not refetch on window focus
 * - Automatically handles loading and error states
 * 
 * @returns Query result with chats array, loading state, and error state
 */
export function useChats() {
  return useQuery({
    queryKey: ["chats"],
    queryFn: fetchChats,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * React Query mutation hook to delete a chat.
 * 
 * Automatically invalidates the chats query cache after successful deletion.
 * 
 * @returns Mutation object with mutate function and mutation state
 */
export function useDeleteChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => {
      const res = await axios.delete<{ success: boolean; message: string }>(
        `/api/chat/${chatId}`
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

/**
 * Hook providing utilities to update the chats cache in React Query.
 * 
 * Provides functions for:
 * - Invalidating the chats query (forces refetch)
 * - Setting/updating a chat in the cache
 * - Adding a new chat to the cache
 * 
 * All updates are optimistic and immediately reflected in the UI.
 * 
 * @returns Object with invalidate, updateChat, addChat, and setChat functions
 */
export function useUpdateChats() {
  const queryClient = useQueryClient();

  /**
   * Invalidates the chats query, forcing a refetch from the server
   */
  const invalidate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["chats"] });
  }, [queryClient]);

  /**
   * Sets or updates a chat in the cache.
   * If chat doesn't exist, adds it to the beginning of the list.
   * If chat exists, updates it in place.
   */
  const setChat = useCallback(
    (chat: ChatWithLastMessage) => {
      queryClient.setQueryData<ChatWithLastMessage[]>(["chats"], (old) => {
        const list = old ?? [];
        const idx = list.findIndex((c) => c.id === chat.id);

        if (idx === -1) return [chat, ...list];

        const updated = [...list];
        updated[idx] = { ...updated[idx], ...chat };
        return updated;
      });
    },
    [queryClient]
  );

  /**
   * Updates specific fields of a chat in the cache.
   * 
   * @param chatId - ID of the chat to update
   * @param updates - Partial chat object with fields to update
   */
  const updateChat = useCallback(
    (chatId: string, updates: Partial<ChatWithLastMessage>) => {
      queryClient.setQueryData<ChatWithLastMessage[]>(["chats"], (old) => {
        if (!old) return old;
        return old.map((chat) =>
          chat.id === chatId ? { ...chat, ...updates } : chat
        );
      });
    },
    [queryClient]
  );

  /**
   * Adds a new chat to the cache (alias for setChat).
   * 
   * @param newChat - New chat to add
   */
  const addChat = useCallback(
    (newChat: ChatWithLastMessage) => {
      setChat(newChat);
    },
    [setChat]
  );

  return useMemo(
    () => ({
      invalidate,
      updateChat,
      addChat,
      setChat,
    }),
    [invalidate, updateChat, addChat, setChat]
  );
}
