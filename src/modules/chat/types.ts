import { ToolResultContentPart } from "../tools/types";

export type Chat = {
  id: string;
  title: string;
  updatedAt: Date;
  createdAt: Date;
  userId: string | null;
  sessionId: string | null;
};

export type GetChatsResult =
  | { success: true; data: Chat[] }
  | { success: false; error: string };

export type DeleteChatResult =
  | { success: true; message: string }
  | { success: false; error: string };

export type UpdateChatResult =
  | { success: true; data: Chat }
  | { success: false; error: string };

export type CreateChatResult =
  | { success: true; data: Chat }
  | { success: false; error: string };

export type VerifyChatResult =
  | { success: true; data: Chat }
  | { success: false; error: string };

export type GenerateTitleResult =
  | { success: true; data: { title: string } }
  | { success: false; error: string };

export type ChatRequestBody = {
  query: string;
  frontendToolCallRes: ToolResultContentPart | null;
};
