"use server";

import { db } from "@/db";
import { tools } from "@/db/schema";
import { apiResponse, errorHandler } from "@/lib/handler";

export async function createToolCall(
  assistantMessageId: string,
  toolCallId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: Record<string, unknown>,
  createdAt: Date
) {
  try {
    const toolCall = await db.insert(tools).values({
      id: toolCallId,
      assistantMessageId: assistantMessageId,
      toolName,
      toolArgs,
      toolResult,
      createdAt,
    });

    return apiResponse("Tool call created successfully", 200, toolCall);
  } catch (error) {
    console.error("Error creating tool call:", error);
    return errorHandler(error);
  }
}
