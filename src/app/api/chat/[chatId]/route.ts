import {
  streamText,
  UIMessage,
  convertToModelMessages,
  stepCountIs,
  Output,
  JSONValue,
} from "ai";
import type { ToolResultPart } from "@ai-sdk/provider-utils";
import { openai } from "@ai-sdk/openai";
import { weatherTool } from "@/lib/tools/weather";
import { emailValidatorTool } from "@/lib/tools/email-validator";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/proxy";
import {
  verifyChatOwnership,
  updateChatTimestamp,
  deleteChat,
  generateChatTitleWithAI,
} from "@/modules/chat/server";
import { saveMessage, getChatMessages } from "@/modules/messages/server";
import { StreamStructuredSchema } from "@/modules/chat/schemas";
import { CHAT_AGENT } from "@/lib/system_prompts/chat-agent";
import { createToolCall } from "@/modules/tools/server";
import { ChatRequestBody } from "@/modules/chat/types";
import type { ToolResultContentPart } from "@/modules/tools/types";

/**
 * Type definitions for request body parsing
 */
type TextUIPart = {
  type: "text";
  text: string;
};

type RequestUIMessage = {
  id?: string;
  role?: "user" | "assistant" | "system";
  parts?: Array<TextUIPart | { type: string; [key: string]: unknown }>;
  content?: string;
};

type ChatRequestPayload = {
  query?: string;
  text?: string;
  messages?: RequestUIMessage[];
  frontendToolCallRes?: ToolResultContentPart | null;
};

/**
 * GET /api/chat/[chatId]
 *
 * Retrieves all messages for a specific chat.
 *
 * Authentication:
 * - Requires either authenticated user (userId) or session cookie
 * - Does not allow fetching messages for "new" chat ID
 *
 * @param req - Request object
 * @param params - Route parameters containing chatId
 * @returns JSON response with array of messages or error
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
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

    const { chatId } = await params;

    // Don't allow getting messages for "new" chat
    if (chatId === "new") {
      return new Response(JSON.stringify({ error: "Invalid chat ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get messages using server action
    const result = await getChatMessages(chatId, userId, sessionId);

    if (!result.success) {
      const statusCode = result.error.includes("not found")
        ? 404
        : result.error.includes("Unauthorized") ||
          result.error.includes("denied")
        ? 403
        : 500;

      return new Response(JSON.stringify({ error: result.error }), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result.data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * DELETE /api/chat/[chatId]
 *
 * Deletes a specific chat and all its associated messages.
 *
 * Authentication:
 * - Requires either authenticated user (userId) or session cookie
 * - Verifies chat ownership before deletion
 * - Does not allow deleting "new" chat ID
 *
 * @param req - Request object
 * @param params - Route parameters containing chatId
 * @returns JSON response with success status or error
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
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

    const { chatId } = await params;

    // Don't allow deleting "new" chat
    if (chatId === "new") {
      return new Response(JSON.stringify({ error: "Invalid chat ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete chat using server action
    const result = await deleteChat(chatId, userId, sessionId);

    if (!result.success) {
      const statusCode = result.error.includes("not found")
        ? 404
        : result.error.includes("Unauthorized") ||
          result.error.includes("denied")
        ? 403
        : 500;

      return new Response(JSON.stringify({ error: result.error }), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: result.message }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error deleting chat:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Extracts the user query from various request body formats.
 *
 * Supports multiple formats:
 * - Direct query/text fields
 * - AI SDK UIMessage format with parts array
 * - Legacy content field format
 *
 * @param body - Request body (unknown type)
 * @returns Extracted query string or null if not found
 */
function extractQueryFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;

  const bodyObj = body as ChatRequestPayload;

  if (typeof bodyObj.query === "string" && bodyObj.query.trim()) {
    return bodyObj.query.trim();
  }
  if (typeof bodyObj.text === "string" && bodyObj.text.trim()) {
    return bodyObj.text.trim();
  }

  // AI SDK typically sends messages: UIMessage[]
  if (Array.isArray(bodyObj.messages) && bodyObj.messages.length > 0) {
    const last = bodyObj.messages[bodyObj.messages.length - 1];

    // UIMessage has parts [{type:"text", text:"..."}]
    if (last && typeof last === "object" && Array.isArray(last.parts)) {
      const textPart = last.parts.find(
        (p): p is TextUIPart =>
          p !== null &&
          typeof p === "object" &&
          "type" in p &&
          p.type === "text" &&
          "text" in p &&
          typeof p.text === "string"
      );
      if (textPart?.text?.trim()) {
        return textPart.text.trim();
      }
    }

    // fallback older format content
    if (typeof last?.content === "string" && last.content.trim()) {
      return last.content.trim();
    }
  }

  return null;
}

/**
 * POST /api/chat/[chatId]
 *
 * Streams AI chat responses for an existing chat.
 *
 * This endpoint:
 * - Validates chat ownership
 * - Saves user message before streaming
 * - Streams AI response using OpenAI GPT-4o
 * - Supports tool calls (weather, email_validator)
 * - Generates chat title after first message
 * - Saves assistant message and tool calls on completion
 *
 * Authentication:
 * - Requires either authenticated user (userId) or session cookie
 * - Chat must already exist (cannot use "new" as chatId)
 *
 * Request Body:
 * - query/text/messages: User's message content
 * - frontendToolCallRes: Optional tool call result from frontend
 *
 * @param req - Request object containing message data
 * @param params - Route parameters containing chatId
 * @returns Streaming response with AI-generated messages
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { userId } = await auth();
    const { chatId } = await params;

    if (!chatId || typeof chatId !== "string") {
      return Response.json(
        { error: "chatId is required and must be a string" },
        { status: 400 }
      );
    }

    // IMPORTANT: Chat must already exist - use POST /api/chat to create new chats
    if (chatId === "new") {
      return Response.json(
        {
          error:
            "Invalid route. Create chat using POST /api/chat, then stream to /api/chat/{id}.",
        },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const query = extractQueryFromBody(body);
    if (!query) {
      return Response.json(
        { error: "query/text/messages required (non-empty string)" },
        { status: 400 }
      );
    }

    const bodyObj = body as ChatRequestPayload;
    const validatedBody: ChatRequestBody = {
      query,
      frontendToolCallRes: bodyObj?.frontendToolCallRes ?? null,
    };

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value || null;

    if (!userId && !sessionId) {
      return Response.json(
        { error: "Unauthorized - no user or session" },
        { status: 401 }
      );
    }

    // Verify ownership
    const verifyResult = await verifyChatOwnership(chatId, userId, sessionId);
    if (!verifyResult.success) {
      return Response.json(
        { error: verifyResult.error },
        { status: verifyResult.error.includes("Unauthorized") ? 401 : 500 }
      );
    }

    // Load existing messages
    const messagesResult = await getChatMessages(chatId, userId, sessionId);
    if (!messagesResult.success || !messagesResult.data) {
      return Response.json(
        { error: "Failed to get chat messages" },
        { status: 400 }
      );
    }

    const dbMessages = messagesResult.data;
    const existingUserCount = dbMessages.filter(
      (m) => m.role === "user"
    ).length;

    // Save user message BEFORE starting the stream so it's available immediately
    const saveUser = await saveMessage(
      chatId,
      "user",
      validatedBody.query,
      [{ type: "text", text: validatedBody.query }],
      null
    );
    if (!saveUser.success) {
      return Response.json(
        { error: saveUser.error || "Failed to save user message" },
        { status: 500 }
      );
    }

    // Convert database messages to AI SDK format
    const agentMessages = await convertToModelMessages(
      dbMessages.map((msg) => ({
        id: msg.id,
        role: msg.role as "user" | "assistant" | "system",
        parts: msg.parts as UIMessage["parts"],
      }))
    );

    // Inject authentication alert for unauthenticated users after 2 messages
    // This alerts the AI agent that the user is not authenticated
    let user_query = validatedBody.query;
    if (existingUserCount > 2 && !userId) {
      user_query +=
        "\n\n<<<<<====== Alert =======>>>>>>>>>\nUser is not Authenticated\n<<<<<====== Alert =======>>>>>>>>>";
    }

    agentMessages.push({ role: "user", content: user_query });

    // Inject tool call result from frontend if provided
    // This allows the AI to continue the conversation after a tool call
    if (validatedBody.frontendToolCallRes) {
      const toolResult = validatedBody.frontendToolCallRes;

      const toolContent: ToolResultPart[] = [
        {
          type: "tool-result",
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          output:
            toolResult.output.type === "json"
              ? { type: "json", value: toolResult.output.value as JSONValue }
              : { type: "text", value: String(toolResult.output.value) },
        },
      ];

      agentMessages.push({
        role: "tool",
        content: toolContent,
      });
    }

    const result = streamText({
      model: openai("gpt-4o"),
      system: CHAT_AGENT,
      messages: agentMessages,
      tools: {
        weather: weatherTool,
        email_validator: emailValidatorTool,
      },
      output: Output.object({ schema: StreamStructuredSchema }),
      stopWhen: stepCountIs(10),

      /**
       * Callback executed when the AI stream finishes.
       * Saves the assistant message, tool calls, and generates chat title if needed.
       */
      onFinish: async ({ text, steps }) => {
        // User message was already saved before stream started for immediate availability
        // Now save the assistant's response
        const saveAssistant = await saveMessage(
          chatId,
          "assistant",
          text,
          [{ type: "text", text }],
          saveUser.data.id
        );
        if (!saveAssistant.success) throw new Error(saveAssistant.error);

        // Save all tool calls that were executed during the conversation
        const createdAtForToolCalls = new Date();
        for (const step of steps) {
          for (const item of step.content) {
            if (item.type === "tool-result") {
              createToolCall(
                saveAssistant.data.id,
                item.toolCallId,
                item.toolName,
                item.input as Record<string, unknown>,
                item.output as Record<string, unknown>,
                createdAtForToolCalls
              ).catch((err) => console.error("Error creating tool call:", err));
            }
          }
        }

        // Update chat's last modified timestamp
        await updateChatTimestamp(chatId);

        // Generate chat title after the FIRST user message
        // existingUserCount === 0 means this was the first message in the chat
        if (existingUserCount === 0) {
          await generateChatTitleWithAI(
            validatedBody.query,
            chatId,
            userId,
            sessionId
          );
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error in chat route:", error);
    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
