import { tool } from "ai";
import { z } from "zod";

export const emailValidatorTool = tool({
  description: "Validate whether an email address is in a valid format.",
  inputSchema: z.object({
    email: z
      .string()
      .describe("Email address to validate, e.g. user@example.com"),
  }),
  execute: async ({ email }) => {
    const value = (email ?? "").trim();

    // Basic, practical email format validation (not a deliverability check)
    // - one "@"
    // - no spaces
    // - non-empty local + domain
    // - domain has a dot and valid labels
    const isValidFormat = (() => {
      if (!value) return false;
      if (value.length > 254) return false;
      if (/\s/.test(value)) return false;

      const atIndex = value.indexOf("@");
      if (atIndex <= 0) return false;
      if (atIndex !== value.lastIndexOf("@")) return false;

      const local = value.slice(0, atIndex);
      const domain = value.slice(atIndex + 1);

      if (!local || !domain) return false;
      if (local.length > 64) return false;
      if (domain.length > 253) return false;

      // local part: disallow leading/trailing dot, consecutive dots
      if (local.startsWith(".") || local.endsWith(".")) return false;
      if (local.includes("..")) return false;

      // domain: must contain dot, no leading/trailing dot, no consecutive dots
      if (!domain.includes(".")) return false;
      if (domain.startsWith(".") || domain.endsWith(".")) return false;
      if (domain.includes("..")) return false;

      // domain labels must be alnum/hyphen, not start/end with hyphen
      const labels = domain.split(".");
      for (const label of labels) {
        if (!label) return false;
        if (label.length > 63) return false;
        if (label.startsWith("-") || label.endsWith("-")) return false;
        if (!/^[A-Za-z0-9-]+$/.test(label)) return false;
      }

      // overall simple character sanity (allow common email chars)
      // (kept lenient; format checks above do most of the work)
      if (!/^[^\s@]+@[^\s@]+$/.test(value)) return false;

      return true;
    })();

    if (isValidFormat) {
      return { success: true, message: "Email is Valid " };
    }
    return { success: false, message: "Email is Not Valid " };
  },
});
