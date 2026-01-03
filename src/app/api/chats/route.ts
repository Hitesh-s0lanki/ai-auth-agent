import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/proxy";
import { getChats } from "@/modules/chat/server";

/**
 * GET /api/chats
 * 
 * Retrieves all chats for the current user or session.
 * 
 * This endpoint:
 * - Returns all chats belonging to the authenticated user OR session
 * - Chats are ordered by most recently updated first
 * - Supports both authenticated users and anonymous sessions
 * 
 * Authentication:
 * - Requires either authenticated user (userId) or session cookie
 * 
 * @returns JSON response with array of chats or error
 */
export async function GET() {
  try {
    // Get authenticated user
    const { userId } = await auth();

    // Get session ID from cookies
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value || null;

    // Call the server action
    const result = await getChats(userId, sessionId);

    if (!result.success) {
      console.error("[GET /api/chats] Error:", result.error);
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.error.includes("Unauthorized") ? 401 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result.data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[GET /api/chats] Unexpected error:", error);
    console.error("[GET /api/chats] Error stack:", error instanceof Error ? error.stack : "No stack");
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
