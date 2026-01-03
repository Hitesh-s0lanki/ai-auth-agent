"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserButton } from "@/components/user-button";

interface ChatHeaderProps {
  title?: string;
}

export function ChatHeader({}: ChatHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 px-4 justify-between">
      <SidebarTrigger />
      <UserButton />
    </header>
  );
}
