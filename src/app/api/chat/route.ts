import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/proxy";
import { createChat } from "@/modules/chat/server";

/**
 * POST /api/chat
 * 
 * Creates a new chat session.
 * 
 * This endpoint:
 * - Creates a new chat in the database
 * - Supports both authenticated users and anonymous sessions
 * - Optionally accepts a first message to pre-populate the chat
 * 
 * Authentication:
 * - Requires either authenticated user (userId) or session cookie
 * - If no session cookie exists, one will be created by the middleware
 * 
 * Request Body:
 * - firstMessage (optional): Initial message to start the chat with
 * 
 * @param req - Request object containing optional firstMessage
 * @returns JSON response with created chat data (id, title, timestamps)
 */
export async function POST(req: Request) {
  try {
    // Get authenticated user
    const { userId } = await auth();

    // Get session ID from cookies
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value || null;

    // Ensure we have either userId or sessionId
    if (!userId && !sessionId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - no user or session" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const bodyObj = body as Record<string, unknown>;
    const firstMessage = bodyObj.firstMessage as string | undefined;

    // Create a new chat
    // Note: createChat handles userId and sessionId internally via auth() and cookies()
    const createChatResult = await createChat(undefined, firstMessage);

    if (!createChatResult.success) {
      return new Response(JSON.stringify({ error: createChatResult.error }), {
        status: createChatResult.error.includes("Unauthorized") ? 401 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(createChatResult.data), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating chat:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

