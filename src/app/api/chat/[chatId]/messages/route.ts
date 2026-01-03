import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/proxy";
import { verifyChatOwnership } from "@/modules/chat/server";
import { getChatMessages } from "@/modules/messages/server";

/**
 * GET /api/chat/[chatId]/messages
 * 
 * Retrieves all messages for a specific chat.
 * 
 * Authentication:
 * - Requires either authenticated user (userId) or session cookie
 * - Verifies chat ownership before returning messages
 * 
 * @param params - Route parameters containing chatId
 * @returns JSON response with array of messages or error
 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { userId } = await auth();
    const sessionId = (await cookies()).get(SESSION_COOKIE_NAME)?.value || null;

    if (!userId && !sessionId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { chatId } = await params;
    if (!chatId) {
      return Response.json({ error: "chatId is required" }, { status: 400 });
    }

    const verify = await verifyChatOwnership(chatId, userId, sessionId);
    if (!verify.success) {
      return Response.json({ error: verify.error }, { status: 403 });
    }

    const res = await getChatMessages(chatId, userId, sessionId);
    if (!res.success || !res.data) {
      return Response.json({ error: "Messages not found" }, { status: 404 });
    }

    return Response.json(res.data, { status: 200 });
  } catch (e) {
    return Response.json(
      {
        error: "Internal server error",
        message: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

