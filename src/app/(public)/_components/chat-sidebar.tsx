"use client";

import { useState, useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageSquare, Trash2, Search, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatWithLastMessage } from "@/hooks/use-chats";

interface ChatSidebarProps {
  chats: ChatWithLastMessage[];
  currentChatId?: string;
  onChatSelect?: (chatId: string) => void;
  onNewChat?: () => void;
  onDeleteChat?: (chatId: string) => void;
}

export function ChatSidebar({
  chats,
  currentChatId,
  onChatSelect,
  onNewChat,
  onDeleteChat,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  // Filter chats based on search query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) {
      return chats;
    }
    const query = searchQuery.toLowerCase();
    return chats.filter(
      (chat) =>
        chat.title.toLowerCase().includes(query) ||
        chat.lastMessage?.toLowerCase().includes(query)
    );
  }, [chats, searchQuery]);

  // Get the chat title for the delete dialog
  const chatToDeleteTitle = useMemo(() => {
    if (!chatToDelete) return "";
    return chats.find((chat) => chat.id === chatToDelete)?.title || "";
  }, [chatToDelete, chats]);

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatToDelete(chatId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (chatToDelete && onDeleteChat) {
      onDeleteChat(chatToDelete);
    }
    setDeleteDialogOpen(false);
    setChatToDelete(null);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setChatToDelete(null);
  };

  return (
    <>
      <Sidebar collapsible="offcanvas" className="bg-white border-r">
        <SidebarHeader className="px-3">
          <div className="relative py-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <Input
              placeholder="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm bg-gray-50 border-gray-200 focus:bg-white"
            />
          </div>
        </SidebarHeader>
        <SidebarContent className="bg-white">
          <SidebarGroup className="px-3">
            <SidebarGroupContent className="pb-4">
              <Button
                onClick={onNewChat}
                variant="ghost"
                className="w-full justify-start gap-2 h-8 text-sm font-normal hover:bg-gray-100"
              >
                <Edit className="size-4 text-gray-600" />
                <span>New chat</span>
              </Button>
            </SidebarGroupContent>
            <SidebarGroupLabel className="text-xs font-medium text-gray-500 px-2 py-1.5">
              Your chats
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredChats.length === 0 ? (
                  <SidebarMenuItem>
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                      <MessageSquare className="mb-2 size-8 text-gray-300" />
                      <p className="text-sm text-gray-500">
                        {searchQuery.trim()
                          ? "No chats found"
                          : "No conversations yet"}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {searchQuery.trim()
                          ? "Try a different search term"
                          : "Start a new chat to begin"}
                      </p>
                    </div>
                  </SidebarMenuItem>
                ) : (
                  filteredChats.map((chat) => (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        isActive={currentChatId === chat.id}
                        onClick={() => onChatSelect?.(chat.id)}
                        className={cn(
                          "w-full justify-start gap-2 h-9 px-4 rounded-md text-sm font-normal",
                          currentChatId === chat.id
                            ? "bg-gray-100 text-gray-900"
                            : "text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        <span className="truncate flex-1 text-left">
                          {chat.title}
                        </span>
                      </SidebarMenuButton>
                      {onDeleteChat && (
                        <SidebarMenuAction
                          onClick={(e) => handleDeleteClick(chat.id, e)}
                          showOnHover
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Trash2 className="size-4" />
                        </SidebarMenuAction>
                      )}
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setChatToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{chatToDeleteTitle}&quot;?
              This action cannot be undone and will permanently delete all
              messages in this conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
