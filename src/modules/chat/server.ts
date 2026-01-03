"use server";

import { db, chats } from "@/db";
import { eq, desc, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { TITLE_GENERATED_AGENT } from "@/lib/system_prompts/title-generated-agent";
import { auth } from "@clerk/nextjs/server";
import {
  GetChatsResult,
  DeleteChatResult,
  UpdateChatResult,
  CreateChatResult,
  VerifyChatResult,
  GenerateTitleResult,
} from "./types";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/proxy";

/**
 * Server action to get all chats for a user or session
 * @param userId - Optional user ID (for authenticated users)
 * @param sessionId - Optional session ID (for unauthenticated users)
 * @returns Chat array or error
 */
export async function getChats(
  userId?: string | null,
  sessionId?: string | null
): Promise<GetChatsResult> {
  try {
    // Ensure we have either userId or sessionId
    if (!userId && !sessionId) {
      return {
        success: false,
        error: "Unauthorized - no user or session",
      };
    }

    // Build the where condition
    let whereCondition;
    if (userId && sessionId) {
      // If both are provided, get chats that belong to either
      whereCondition = or(
        eq(chats.userId, userId),
        eq(chats.sessionId, sessionId)
      );
    } else if (userId) {
      whereCondition = eq(chats.userId, userId);
    } else {
      whereCondition = eq(chats.sessionId, sessionId!);
    }

    // Fetch chats based on userId and/or sessionId
    const userChats = await db
      .select()
      .from(chats)
      .where(whereCondition)
      .orderBy(desc(chats.updatedAt));

    // Ensure proper serialization by mapping to Chat type
    const mappedChats = userChats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
      createdAt: chat.createdAt,
      userId: chat.userId,
      sessionId: chat.sessionId,
    }));

    return {
      success: true,
      data: mappedChats,
    };
  } catch (error) {
    console.error("[getChats] Error fetching chats:", error);
    console.error("[getChats] Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch chats",
    };
  }
}

/**
 * Server action to delete a chat
 * @param chatId - The ID of the chat to delete
 * @param userId - Optional user ID (for authenticated users)
 * @param sessionId - Optional session ID (for unauthenticated users)
 * @returns Success or error message
 */
export async function deleteChat(
  chatId: string,
  userId?: string | null,
  sessionId?: string | null
): Promise<DeleteChatResult> {
  try {
    // Ensure we have either userId or sessionId
    if (!userId && !sessionId) {
      return {
        success: false,
        error: "Unauthorized - no user or session",
      };
    }

    if (!chatId) {
      return {
        success: false,
        error: "chatId is required",
      };
    }

    // Verify the chat belongs to the user/session
    const chat = await db
      .select()
      .from(chats)
      .where(eq(chats.id, chatId))
      .limit(1);

    if (chat.length === 0) {
      return {
        success: false,
        error: "Chat not found",
      };
    }

    const chatToDelete = chat[0];

    // Verify ownership
    if (userId && chatToDelete.userId !== userId) {
      return {
        success: false,
        error: "Unauthorized - chat does not belong to user",
      };
    }

    if (!userId && chatToDelete.sessionId !== sessionId) {
      return {
        success: false,
        error: "Unauthorized - chat does not belong to session",
      };
    }

    // Delete the chat (messages will be cascade deleted due to foreign key constraint)
    await db.delete(chats).where(eq(chats.id, chatId));

    return {
      success: true,
      message: "Chat deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting chat:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete chat",
    };
  }
}

/**
 * Server action to update a chat's title
 * @param chatId - The ID of the chat to update
 * @param title - The new title for the chat
 * @param userId - Optional user ID (for authenticated users)
 * @param sessionId - Optional session ID (for unauthenticated users)
 * @returns Updated chat or error message
 */
export async function updateChat(
  chatId: string,
  title: string,
  userId?: string | null,
  sessionId?: string | null
): Promise<UpdateChatResult> {
  try {
    // Ensure we have either userId or sessionId
    if (!userId && !sessionId) {
      return {
        success: false,
        error: "Unauthorized - no user or session",
      };
    }

    if (!chatId) {
      return {
        success: false,
        error: "chatId is required",
      };
    }

    if (!title || title.trim().length === 0) {
      return {
        success: false,
        error: "title is required",
      };
    }

    // Verify the chat belongs to the user/session
    const chat = await db
      .select()
      .from(chats)
      .where(eq(chats.id, chatId))
      .limit(1);

    if (chat.length === 0) {
      return {
        success: false,
        error: "Chat not found",
      };
    }

    const chatToUpdate = chat[0];

    // Verify ownership
    if (userId && chatToUpdate.userId !== userId) {
      return {
        success: false,
        error: "Unauthorized - chat does not belong to user",
      };
    }

    if (!userId && chatToUpdate.sessionId !== sessionId) {
      return {
        success: false,
        error: "Unauthorized - chat does not belong to session",
      };
    }

    // Update the chat title and updatedAt timestamp
    const updatedChats = await db
      .update(chats)
      .set({
        title: title.trim(),
        updatedAt: sql`NOW()`,
      })
      .where(eq(chats.id, chatId))
      .returning();

    if (updatedChats.length === 0) {
      return {
        success: false,
        error: "Failed to update chat",
      };
    }

    return {
      success: true,
      data: updatedChats[0],
    };
  } catch (error) {
    console.error("Error updating chat:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update chat",
    };
  }
}

/**
 * Generate chat title from first user message
 */
function generateChatTitle(firstMessage: string): string {
  return firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
}

/**
 * Server action to create a new chat
 * @param title - The title for the chat (will be generated from firstMessage if not provided)
 * @param firstMessage - Optional first message text to generate title from
 * @param userId - Optional user ID (for authenticated users)
 * @param sessionId - Optional session ID (for unauthenticated users)
 * @returns Created chat or error
 */
export async function createChat(
  title?: string,
  firstMessage?: string
): Promise<CreateChatResult> {
  try {
    const { userId } = await auth();

    const cookieStore = await cookies();
    const sessionId =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      "262b1ff2-ceb8-4839-98a8-4fc74d7dc213";

    // Ensure we have either userId or sessionId
    if (!userId && !sessionId) {
      return {
        success: false,
        error: "Unauthorized - no user or session",
      };
    }

    const chatId = randomUUID();
    const chatTitle = title || generateChatTitle(firstMessage || "New Chat");

    const [newChat] = await db
      .insert(chats)
      .values({
        id: chatId,
        userId: userId || null,
        sessionId: userId ? null : sessionId || null,
        title: chatTitle,
      })
      .returning();

    return {
      success: true,
      data: newChat,
    };
  } catch (error) {
    console.error("Error creating chat:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create chat",
    };
  }
}

/**
 * Server action to verify chat ownership
 * @param chatId - The ID of the chat to verify
 * @param userId - Optional user ID (for authenticated users)
 * @param sessionId - Optional session ID (for unauthenticated users)
 * @returns Chat if ownership is verified, or error
 */
export async function verifyChatOwnership(
  chatId: string,
  userId?: string | null,
  sessionId?: string | null
): Promise<VerifyChatResult> {
  try {
    // Ensure we have either userId or sessionId
    if (!userId && !sessionId) {
      return {
        success: false,
        error: "Unauthorized - no user or session",
      };
    }

    if (!chatId) {
      return {
        success: false,
        error: "chatId is required",
      };
    }

    // Verify the chat exists and belongs to the user/session
    const chat = await db
      .select()
      .from(chats)
      .where(eq(chats.id, chatId))
      .limit(1);

    if (chat.length === 0) {
      return {
        success: false,
        error: "Chat not found",
      };
    }

    const chatToVerify = chat[0];

    // Verify ownership
    if (userId && chatToVerify.userId !== userId) {
      return {
        success: false,
        error: "Chat access denied",
      };
    }

    if (!userId && chatToVerify.sessionId !== sessionId) {
      return {
        success: false,
        error: "Chat access denied",
      };
    }

    return {
      success: true,
      data: chatToVerify,
    };
  } catch (error) {
    console.error("Error verifying chat:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to verify chat",
    };
  }
}

/**
 * Server action to update chat's updatedAt timestamp
 * @param chatId - The ID of the chat to update
 * @returns Success or error
 */
export async function updateChatTimestamp(
  chatId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!chatId) {
      return {
        success: false,
        error: "chatId is required",
      };
    }

    await db
      .update(chats)
      .set({ updatedAt: sql`NOW()` })
      .where(eq(chats.id, chatId));

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating chat timestamp:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update chat timestamp",
    };
  }
}

/**
 * Server action to generate and update a chat title using AI
 * @param content - The chat content to generate title from
 * @param chatId - The ID of the chat to update
 * @param userId - Optional user ID (for authenticated users)
 * @param sessionId - Optional session ID (for unauthenticated users)
 * @returns Generated title or error
 */
export async function generateChatTitleWithAI(
  content: string,
  chatId: string,
  userId?: string | null,
  sessionId?: string | null
): Promise<GenerateTitleResult> {
  try {
    // Ensure we have either userId or sessionId
    if (!userId && !sessionId) {
      return {
        success: false,
        error: "Unauthorized - no user or session",
      };
    }

    // Validate input
    if (!content || typeof content !== "string") {
      return {
        success: false,
        error: "Content is required and must be a string",
      };
    }

    if (!chatId || typeof chatId !== "string") {
      return {
        success: false,
        error: "Chat ID is required and must be a string",
      };
    }

    // Verify the chat belongs to the user/session before generating title
    const verifyResult = await verifyChatOwnership(chatId, userId, sessionId);
    if (!verifyResult.success) {
      return {
        success: false,
        error: verifyResult.error,
      };
    }

    const user_message = `
        generate a title for the following chat session:
        
        ${content}
    `;

    // Generate title using Google Gemini
    const { text } = await generateText({
      model: google("gemini-3-flash-preview"),
      messages: [
        { role: "system", content: TITLE_GENERATED_AGENT },
        { role: "user", content: user_message },
      ],
    });

    const title = (text || "").trim() || "New Chat";

    await db
      .update(chats)
      .set({
        title,
      })
      .where(eq(chats.id, chatId))
      .returning({ id: chats.id, title: chats.title });

    return {
      success: true,
      data: { title },
    };
  } catch (error) {
    console.error("Error generating title:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    };
  }
}
