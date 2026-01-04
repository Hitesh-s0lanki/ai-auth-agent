import {
  streamText,
  UIMessage,
  convertToModelMessages,
  stepCountIs,
  Output,
} from "ai";
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
  // generateChatTitleWithAI,
} from "@/modules/chat/server";
import { saveMessage, getChatMessages } from "@/modules/messages/server";
import { StreamStructuredSchema } from "@/modules/chat/schemas";
import { CHAT_AGENT } from "@/lib/system_prompts/chat-agent";
import { createToolCall } from "@/modules/tools/server";
import { ChatRequestBody } from "@/modules/chat/types";
import type { ToolResultContentPart } from "@/modules/tools/types";
import { validateToolCallId } from "@/lib/tool-call-id";

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

    const bodyObj = body as ChatRequestPayload;
    let query = extractQueryFromBody(body);
    const frontendToolCallRes = bodyObj?.frontendToolCallRes ?? null;

    // Tool continuation: if tool result present and user sent "continue", do not save that as a real user query
    if (frontendToolCallRes && query === "continue") {
      query = null;
    }

    if (!query && !frontendToolCallRes) {
      return Response.json(
        {
          error:
            "query/text/messages required (non-empty string) or frontendToolCallRes must be provided",
        },
        { status: 400 }
      );
    }

    const validatedBody: ChatRequestBody = {
      query: query || "", // empty string allowed when only tool result exists
      frontendToolCallRes,
    };

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value || null;

    if (!userId && !sessionId) {
      return Response.json(
        { error: "Unauthorized - no user or session" },
        { status: 401 }
      );
    }

    const verifyResult = await verifyChatOwnership(chatId, userId, sessionId);
    if (!verifyResult.success) {
      return Response.json(
        { error: verifyResult.error },
        { status: verifyResult.error.includes("Unauthorized") ? 401 : 500 }
      );
    }

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

    // Save user message ONLY if query exists (not for tool-only continuation)
    let saveUser: Awaited<ReturnType<typeof saveMessage>> | null = null;
    if (validatedBody.query && validatedBody.query.trim()) {
      saveUser = await saveMessage(
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
    }

    // Convert DB messages to model messages
    const agentMessages = await convertToModelMessages(
      dbMessages.map((msg) => ({
        id: msg.id,
        role: msg.role as "user" | "assistant" | "system",
        parts: msg.parts as UIMessage["parts"],
      }))
    );

    // Inject user query if present
    if (validatedBody.query && validatedBody.query.trim()) {
      let user_query = validatedBody.query;

      // Inject auth alert after 2 user messages if not logged in
      if (existingUserCount > 2 && !userId) {
        user_query +=
          "\n\n<<<<<====== Alert =======>>>>>>>>>\nUser is not Authenticated\n<<<<<====== Alert =======>>>>>>>>>";
      }

      agentMessages.push({ role: "user", content: user_query });
    }

    /**
     * ✅ Frontend tool results:
     * Keep as USER context (not tool role) to avoid OpenAI rejecting tool-result
     * when there was no prior tool-call in OpenAI tool system.
     *
     * This formatting is deterministic for the prompt to parse.
     */
    if (validatedBody.frontendToolCallRes) {
      const toolResult = validatedBody.frontendToolCallRes;

      const toolResultText =
        toolResult.output.type === "json"
          ? JSON.stringify(toolResult.output.value, null, 2)
          : String(toolResult.output.value);

      const toolContextMessage =
        `[FRONTEND_TOOL_RESULT]\n` +
        `toolName=${toolResult.toolName}\n` +
        `toolCallId=${toolResult.toolCallId}\n` +
        `output=${toolResultText}\n` +
        `[/FRONTEND_TOOL_RESULT]`;

      agentMessages.push({
        role: "user",
        content: toolContextMessage,
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

      onFinish: async ({ text, steps }) => {
        const parentMessageId =
          saveUser && saveUser.success ? saveUser.data.id : null;

        // Parse structured response if model returned JSON string
        let structured: {
          result?: string;
          frontend_tool_call?: {
            tool_name: string;
            tool_args: Record<string, unknown>;
          } | null;
        } | null = null;

        try {
          structured = JSON.parse(text);
        } catch {
          structured = null;
        }

        const displayText =
          structured?.result && typeof structured.result === "string"
            ? structured.result
            : text;

        const assistantParts: UIMessage["parts"] = [
          { type: "text", text: displayText },
        ];

        // Only store structured data in object format if it contains frontend_tool_call
        // This prevents duplicate content in the database
        if (
          structured &&
          typeof structured === "object" &&
          structured.frontend_tool_call
        ) {
          assistantParts.push({
            type: "object",
            object: structured,
          } as unknown as UIMessage["parts"][number]);
        }

        const saveAssistant = await saveMessage(
          chatId,
          "assistant",
          displayText,
          assistantParts,
          parentMessageId
        );

        if (!saveAssistant.success) {
          throw new Error(saveAssistant.error);
        }

        // Save frontend tool call result to DB if provided
        if (validatedBody.frontendToolCallRes) {
          const toolResult = validatedBody.frontendToolCallRes;
          const createdAtForFrontendTool = new Date();

          try {
            const validatedToolCallId = validateToolCallId(
              toolResult.toolCallId
            );
            await createToolCall(
              saveAssistant.data.id,
              validatedToolCallId,
              toolResult.toolName,
              {}, // frontend tools: input not stored
              toolResult.output.type === "json"
                ? (toolResult.output.value as Record<string, unknown>)
                : { value: toolResult.output.value },
              createdAtForFrontendTool
            );
          } catch (err) {
            console.error("Error saving frontend tool call:", err);
          }
        }

        // Save server-side tool calls executed by the model
        const createdAtForToolCalls = new Date();
        for (const step of steps) {
          for (const item of step.content) {
            if (item.type === "tool-result") {
              const validatedToolCallId = validateToolCallId(item.toolCallId);
              createToolCall(
                saveAssistant.data.id,
                validatedToolCallId,
                item.toolName,
                item.input as Record<string, unknown>,
                item.output as Record<string, unknown>,
                createdAtForToolCalls
              ).catch((err) => console.error("Error creating tool call:", err));
            }
          }
        }

        await updateChatTimestamp(chatId);

        // Generate title only after first user message
        // if (
        //   messagesResult.data.filter((m) => m.role === "user").length === 1 &&
        //   validatedBody.query &&
        //   validatedBody.query.trim()
        // ) {
        //   await generateChatTitleWithAI(
        //     messagesResult.data.map((m) => m.content).join("\n") +
        //       "\n" +
        //       validatedBody.query,
        //     chatId,
        //     userId,
        //     sessionId
        //   );
        // }
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
