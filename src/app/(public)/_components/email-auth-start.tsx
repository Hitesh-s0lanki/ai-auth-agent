"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChatFrontendTools } from "@/hooks/use-chat-frontend-tools";

type Step = "EMAIL" | "CODE" | "DONE";

export function EmailOtpOneInput() {
  const { tools, authState, isClerkLoaded, CaptchaSlot } =
    useChatFrontendTools();

  const [step, setStep] = React.useState<Step>("EMAIL");
  const [value, setValue] = React.useState<string>(""); // shared input (email/code)
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const loaded = isClerkLoaded;

  // Sync step with authState
  React.useEffect(() => {
    if (authState.step === "CODE_SENT") {
      setStep("CODE");
    } else if (authState.step === "DONE") {
      setStep("DONE");
    }
  }, [authState.step]);

  const placeholder =
    step === "EMAIL" ? "you@example.com" : "Enter 6-digit code";
  const buttonText =
    step === "EMAIL"
      ? loading
        ? "Sending..."
        : "Continue"
      : loading
      ? "Verifying..."
      : "Verify";

  const canSubmit =
    loaded &&
    !loading &&
    (step === "EMAIL"
      ? value.trim().length >= 5 // minimal
      : value.trim().length >= 4); // code length varies by config; keep flexible

  async function sendCode(emailInput: string) {
    if (!tools?.login_user_start) {
      throw new Error("Frontend tools not initialized");
    }

    const result = await tools.login_user_start.execute({ email: emailInput });

    if (!result.ok) {
      throw new Error(result.error);
    }
  }

  async function verifyCode(code: string) {
    if (!tools?.login_user_verify) {
      throw new Error("Frontend tools not initialized");
    }

    const result = await tools.login_user_verify.execute({ code });

    if (!result.ok) {
      throw new Error(result.error);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      if (step === "EMAIL") {
        const e = value.trim().toLowerCase();
        await sendCode(e);
        setValue(""); // reuse same input for code
        return;
      }

      // CODE
      const code = value.trim();
      await verifyCode(code);
      setValue("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!loaded || loading || !authState.email || !tools?.login_user_resend)
      return;
    setLoading(true);
    setError(null);

    try {
      const result = await tools.login_user_resend.execute();

      if (!result.ok) {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function resetToEmail() {
    setStep("EMAIL");
    setValue("");
    setError(null);
    setLoading(false);
  }

  return (
    <div className="max-w-sm">
      <div className="flex items-center gap-2">
        <Input
          type={step === "EMAIL" ? "email" : "text"}
          inputMode={step === "EMAIL" ? "email" : "numeric"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!loaded || loading || step === "DONE"}
          autoComplete={step === "EMAIL" ? "email" : "one-time-code"}
        />

        <Button onClick={handleSubmit} disabled={!canSubmit || step === "DONE"}>
          {step === "DONE" ? "Done" : buttonText}
        </Button>
      </div>

      {/* Required for custom SIGN_UP flow Smart CAPTCHA */}
      <div className="mt-3">
        <CaptchaSlot />
      </div>

      {step === "CODE" && (
        <div className="mt-2 flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="underline underline-offset-4"
          >
            Resend code
          </button>

          <button
            type="button"
            onClick={resetToEmail}
            disabled={loading}
            className="underline underline-offset-4"
          >
            Change email
          </button>
        </div>
      )}

      {step === "DONE" && (
        <p className="mt-2 text-sm">Logged in successfully.</p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
