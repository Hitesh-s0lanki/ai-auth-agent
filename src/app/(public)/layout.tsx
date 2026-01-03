"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ChatSidebar } from "./_components/chat-sidebar";
import { ChatHeader } from "./_components/chat-header";
import { useChats, useDeleteChat } from "@/hooks/use-chats";
import { useRouter, usePathname } from "next/navigation";
import { useMemo } from "react";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: chats = [] } = useChats();
  const deleteChatMutation = useDeleteChat();

  // Extract currentChatId from pathname
  const currentChatId = useMemo(() => {
    if (pathname === "/") {
      return undefined;
    }
    // Extract chatId from pathname like "/abc123" or "/chat/abc123"
    const segments = pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] !== "new"
      ? segments[segments.length - 1]
      : undefined;
  }, [pathname]);

  // Sort chats by updatedAt (most recent first)
  const sortedChats = useMemo(
    () =>
      [...chats].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    [chats]
  );

  // Get current chat title for header
  const headerTitle = useMemo(() => {
    if (!currentChatId) {
      return "AI Chat Assistant";
    }
    const currentChat = chats.find((chat) => chat.id === currentChatId);
    return currentChat?.title || "AI Chat Assistant";
  }, [currentChatId, chats]);

  const handleChatSelect = (selectedChatId: string) => {
    router.push(`/${selectedChatId}`);
  };

  const handleNewChat = () => {
    router.push("/");
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await deleteChatMutation.mutateAsync(chatId);
      // If deleting current chat, navigate to home
      if (currentChatId === chatId) {
        router.push("/");
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      // If deleting current chat, still navigate to home for better UX
      if (currentChatId === chatId) {
        router.push("/");
      }
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <ChatSidebar
        chats={sortedChats}
        currentChatId={currentChatId}
        onChatSelect={handleChatSelect}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
      />
      <SidebarInset>
        <div className="relative flex h-screen w-full flex-col bg-background">
          {/* App Header */}
          <ChatHeader title={headerTitle} />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
