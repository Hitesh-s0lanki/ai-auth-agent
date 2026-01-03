"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sparkles, Wrench, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  message: UIMessage;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

type ToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  providerExecuted?: boolean;
};

function isToolPart(part: unknown): part is ToolPart {
  return (
    isRecord(part) &&
    typeof part.type === "string" &&
    part.type.startsWith("tool-") &&
    typeof part.toolCallId === "string" &&
    typeof part.state === "string"
  );
}

function toolNameFromType(type: string): string {
  // type is `tool-${NAME}` per AI SDK UIMessage docs
  return type.startsWith("tool-") ? type.slice("tool-".length) : "tool";
}

function ToolCard({
  part,
  alignRight,
}: {
  part: ToolPart;
  alignRight: boolean;
}) {
  const name = useMemo(() => toolNameFromType(part.type), [part.type]);

  const isError = part.state === "output-error";

  const statusText = isError ? "failed" : "";

  return (
    <div
      className={cn("min-w-[250px]", alignRight ? "self-end" : "self-start")}
    >
      <div className="flex items-center justify-between gap-3 pt-2 px-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs",
              isError
                ? "bg-destructive/10 text-destructive"
                : "bg-foreground/5 text-foreground"
            )}
          >
            {/* {statusIcon} */}
            <span className="font-medium text-xs flex items-center gap-2">
              <span className="text-muted-foreground">
                {isError ? (
                  <AlertTriangle className="size-3" />
                ) : (
                  <Wrench className="size-3" />
                )}
              </span>
              <span className="capitalize">{name}</span>
            </span>
          </span>

          <span
            className={cn(
              "text-xs",
              isError ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {isError ? part.errorText ?? statusText : statusText}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn("flex gap-0.5", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <Avatar className="size-7 shrink-0 mt-1.5">
          <AvatarFallback className="border bg-white">
            <Sparkles className="size-3.5 text-primary" />
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2",
          isUser ? "items-end" : "items-start"
        )}
      >
        {message.parts.map((part, index) => {
          // Extract text content from different part types
          let textContent: string | null = null;

          // STRUCTURED OUTPUT (object type) - extract only the result field
          // This happens during streaming when using Output.object()
          // TypeScript doesn't recognize "object" as a valid part type, so we use type assertion
          const partRecord = part as Record<string, unknown>;
          if (
            isRecord(part) &&
            partRecord.type === "object" &&
            isRecord(partRecord.object) &&
            typeof (partRecord.object as { result?: string }).result ===
              "string"
          ) {
            textContent = (partRecord.object as { result: string }).result;
          }
          // TEXT part - may contain result directly or as JSON
          else if (
            isRecord(part) &&
            part.type === "text" &&
            typeof part.text === "string"
          ) {
            // Try to parse as JSON to extract result field (for edge cases)
            // Usually the text should already be just the result string
            try {
              const parsed = JSON.parse(part.text);
              if (
                parsed &&
                typeof parsed === "object" &&
                "result" in parsed &&
                typeof parsed.result === "string"
              ) {
                textContent = parsed.result;
              } else {
                textContent = part.text;
              }
            } catch {
              // Not JSON, use text as-is (should already be the result)
              textContent = part.text;
            }
          }

          // Render text content if we have it
          if (textContent !== null) {
            return (
              <div
                key={index}
                className={cn(
                  "rounded-2xl py-2 px-4",
                  isUser
                    ? "bg-muted rounded-br-sm rounded-tl-sm"
                    : "text-foreground rounded-bl-sm"
                )}
              >
                <div className="text-sm leading-normal [word-break:break-word]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => (
                        <p className="mb-1 last:mb-0">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-1 ml-4 list-disc space-y-0.5">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-1 ml-4 list-decimal space-y-0.5">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="leading-normal">{children}</li>
                      ),
                      code: ({ className, children, ...props }) => {
                        const isInline =
                          !className || !className.includes("language-");
                        return isInline ? (
                          <code
                            className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                            {...props}
                          >
                            {children}
                          </code>
                        ) : (
                          <code
                            className="block rounded-lg bg-muted p-2 text-xs font-mono overflow-x-auto"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre className="mb-1 overflow-x-auto rounded-lg bg-muted p-2">
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-1 border-l-4 border-muted-foreground/30 pl-3 italic">
                          {children}
                        </blockquote>
                      ),
                      h1: ({ children }) => (
                        <h1 className="mb-1 mt-2 text-lg font-bold first:mt-0">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="mb-1 mt-2 text-base font-semibold first:mt-0">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="mb-1 mt-1 text-sm font-semibold first:mt-0">
                          {children}
                        </h3>
                      ),
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline hover:text-primary/80"
                        >
                          {children}
                        </a>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold">{children}</strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic">{children}</em>
                      ),
                      hr: () => <hr className="my-2 border-border" />,
                      table: ({ children }) => (
                        <div className="my-1 overflow-x-auto">
                          <table className="min-w-full border-collapse border border-border">
                            {children}
                          </table>
                        </div>
                      ),
                      th: ({ children }) => (
                        <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="border border-border px-2 py-1">
                          {children}
                        </td>
                      ),
                    }}
                  >
                    {textContent}
                  </ReactMarkdown>
                </div>
              </div>
            );
          }

          // TOOL (common UI for all tools)
          if (isToolPart(part)) {
            return <ToolCard key={index} part={part} alignRight={isUser} />;
          }

          return null;
        })}
      </div>
    </div>
  );
}
