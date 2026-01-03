export type Message = {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  userMessageId: string | null;
  raw: Record<string, unknown>;
  createdAt: Date;
};

export type SaveMessageResult =
  | { success: true; data: Message }
  | { success: false; error: string };

export type GetChatMessagesResult =
  | {
      success: true;
      data: Array<
        Message & {
          parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
        }
      >;
    }
  | { success: false; error: string; data?: null };
