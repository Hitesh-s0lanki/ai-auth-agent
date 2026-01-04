/**
 * Generates a short hash from a string using a simple hash function.
 * This is a non-cryptographic hash for generating unique IDs.
 */
function simpleHash(str: string, maxLength: number): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to base36 (0-9, a-z) for shorter representation
  const hashStr = Math.abs(hash).toString(36);
  
  // Truncate or pad to desired length
  if (hashStr.length > maxLength) {
    return hashStr.slice(0, maxLength);
  }
  return hashStr.padStart(maxLength, "0");
}

/**
 * Generates a tool call ID that is guaranteed to be <= 64 characters
 * (OpenAI API requirement for call_id field)
 *
 * @param prefix - Prefix for the ID (e.g., "frontend", "tool")
 * @param toolName - Name of the tool
 * @param messageId - Message ID to derive uniqueness from
 * @returns A tool call ID that is <= 64 characters
 */
export function generateToolCallId(
  prefix: string,
  toolName: string,
  messageId: string
): string {
  // Format: {prefix}-{toolName}-{hash}
  // We need to ensure total length <= 64
  // prefix + toolName + separators (2 dashes) = prefix.length + toolName.length + 2
  // Remaining space for hash = 64 - (prefix.length + toolName.length + 2)
  
  const baseLength = prefix.length + toolName.length + 2; // +2 for dashes
  const maxHashLength = Math.max(8, 64 - baseLength); // At least 8 chars for hash
  
  // Generate a short hash from messageId
  const hash = simpleHash(messageId, maxHashLength);
  
  const toolCallId = `${prefix}-${toolName}-${hash}`;
  
  // Final safety check: truncate if still too long (shouldn't happen, but safety first)
  if (toolCallId.length > 64) {
    const truncatedHash = hash.slice(0, 64 - baseLength);
    return `${prefix}-${toolName}-${truncatedHash}`;
  }
  
  return toolCallId;
}

/**
 * Validates and truncates a tool call ID to ensure it's <= 64 characters.
 * This is a safety function to handle tool call IDs from external sources.
 *
 * @param toolCallId - The tool call ID to validate
 * @returns A tool call ID that is guaranteed to be <= 64 characters
 */
export function validateToolCallId(toolCallId: string): string {
  if (toolCallId.length <= 64) {
    return toolCallId;
  }
  
  // Truncate to 64 characters
  return toolCallId.slice(0, 64);
}

