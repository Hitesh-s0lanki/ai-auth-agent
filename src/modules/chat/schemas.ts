import { z } from "zod";

const ToolArgsSchema = z
  .object({
    email: z.string().nullable(),
    code: z.string().nullable(),
  })
  .strict();

export const FrontendToolCallSchema = z
  .object({
    tool_name: z.string(),
    tool_args: ToolArgsSchema,
  })
  .strict();

export const StreamStructuredSchema = z
  .object({
    result: z.string(),
    // Try using nullable() - if this still causes issues, use .optional() instead
    frontend_tool_call: FrontendToolCallSchema.nullable(),
  })
  .strict();

export type StreamStructured = z.infer<typeof StreamStructuredSchema>;
