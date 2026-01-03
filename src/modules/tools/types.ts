export type ModelMessageRole = "system" | "user" | "assistant" | "tool";

export type ToolResultTextOutput = {
  type: "text";
  value: string;
};

export type ToolResultJsonOutput = {
  type: "json";
  value: unknown; // keep unknown (SDK-safe)
};

export type ToolResultOutput = ToolResultTextOutput | ToolResultJsonOutput;

export type ToolResultContentPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: ToolResultOutput;
};
