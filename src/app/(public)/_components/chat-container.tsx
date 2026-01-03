"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ChatEmpty } from "./chat-empty";
import { ChatLoading } from "./chat-loading";
import { useRef, useEffect } from "react";
import type { UIMessage } from "ai";

interface ChatContainerProps {
  messages: UIMessage[];
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  status: "submitted" | "streaming" | "ready" | "error";
  stop?: () => void;
  error?: Error | null;
}

export function ChatContainer({
  messages,
  input,
  setInput,
  onSubmit,
  status,
  stop,
  error,
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    // Use a small delay to ensure DOM is updated
    const timeoutId = setTimeout(() => {
      // Find the ScrollArea viewport element
      const viewport = scrollAreaRef.current?.querySelector(
        '[data-slot="scroll-area-viewport"]'
      ) as HTMLElement;

      if (viewport) {
        // Scroll to the bottom smoothly
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: "smooth",
        });
      } else if (messagesEndRef.current) {
        // Fallback to scrollIntoView if viewport not found
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages]);

  const isReady = status === "ready";
  const isLoading = status === "submitted" || status === "streaming";

  // Check if we should show loading indicator
  // Show it when status is streaming/submitted, or if last message is assistant and we're not in ready state
  const lastMessage = messages[messages.length - 1];
  const shouldShowLoading =
    isLoading ||
    (lastMessage?.role === "assistant" &&
      status !== "ready" &&
      status !== "error");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
        {error && (
          <div className="px-6 pt-4">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error.message || "Something went wrong. Please try again."}
              </AlertDescription>
            </Alert>
          </div>
        )}
        <div
          ref={scrollAreaRef}
          className="flex-1 h-0 min-h-0 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <div className="w-full max-w-3xl mx-auto px-4 py-8">
              <div className="flex min-h-full flex-col gap-6">
                {messages.length === 0 ? (
                  <ChatEmpty />
                ) : (
                  messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))
                )}
                {/* Show loading indicator while streaming */}
                {shouldShowLoading && <ChatLoading />}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </ScrollArea>
        </div>
        <ChatInput
          input={input}
          setInput={setInput}
          onSubmit={onSubmit}
          disabled={!isReady}
          status={status}
          stop={stop}
        />
    </div>
  );
}
