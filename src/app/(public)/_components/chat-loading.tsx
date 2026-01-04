"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";

export function ChatLoading() {
  return (
    <div className="flex gap-3 justify-start animate-in fade-in duration-300">
      <Avatar className="size-7 shrink-0 mt-1.5">
        <AvatarFallback className="border bg-muted">
          <Spinner className="size-4 text-primary" />
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1 py-2">
        <span className="text-sm text-muted-foreground font-medium">
          Agent is thinking...
        </span>
      </div>
    </div>
  );
}
