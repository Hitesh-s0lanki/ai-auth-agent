"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Plus, X, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  disabled: boolean;
  status: "submitted" | "streaming" | "ready" | "error";
  stop?: () => void;
}

export function ChatInput({
  input,
  setInput,
  onSubmit,
  disabled,
  status,
  stop,
}: ChatInputProps) {
  const isLoading = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !disabled;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
    if (!canSend) return;

    onSubmit(e);
    // Don't clear input here - let the parent handle it to avoid double clearing
  };

  return (
    <div className="">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <form
          onSubmit={handleSubmit}
          action="#"
          className="rounded-2xl border-2 border-gray-300 bg-background shadow-sm"
        >
          {/* TEXTAREA */}
          <div className="px-4 pt-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              disabled={disabled}
              placeholder="What would you like to know?"
              className={cn(
                // fixed height
                "h-[72px]",
                // scroll internally
                "overflow-y-auto",
                // disable resize + styling cleanup
                "resize-none border-0 bg-transparent shadow-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "text-base leading-6",
                "placeholder:text-muted-foreground disabled:opacity-50"
              )}
              onKeyDown={(e) => {
                // prevent IME composition issues
                if ((e.nativeEvent as { isComposing?: boolean })?.isComposing)
                  return;

                // Enter → send
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (
                    e.currentTarget.form as HTMLFormElement | null
                  )?.requestSubmit();
                }
              }}
            />
          </div>

          {/* ACTIONS */}
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-md hover:bg-muted"
              aria-label="Add attachment"
            >
              <Plus className="size-4" />
            </Button>

            <Button
              type={isLoading && stop ? "button" : "submit"}
              onClick={isLoading && stop ? stop : undefined}
              disabled={!isLoading && !canSend}
              size="icon"
              className={cn(
                "size-8 rounded-md shadow-sm transition-all",
                isLoading && stop
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
                !isLoading && !canSend && "opacity-50"
              )}
            >
              {isLoading && stop ? (
                <X className="size-4" />
              ) : isLoading ? (
                <Spinner className="size-4" />
              ) : (
                <CornerDownLeft className="size-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
