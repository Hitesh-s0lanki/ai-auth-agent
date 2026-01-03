"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";

type Step = "EMAIL" | "CODE" | "DONE";

type Flow = "SIGN_IN" | "SIGN_UP";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getClerkErrorMessage(err: unknown): string {
  // Clerk errors often have `errors: [{ message: string }]`
  if (isRecord(err) && Array.isArray(err.errors) && err.errors.length > 0) {
    const first = err.errors[0];
    if (isRecord(first) && typeof first.message === "string")
      return first.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export function EmailOtpOneInput() {
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const { setActive } = useClerk();

  const [step, setStep] = React.useState<Step>("EMAIL");
  const [flow, setFlow] = React.useState<Flow | null>(null);

  const [email, setEmail] = React.useState<string>("");
  const [value, setValue] = React.useState<string>(""); // shared input (email/code)
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const loaded = signInLoaded && signUpLoaded;

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
    if (!signIn || !signUp) {
      throw new Error("Sign in/up not initialized");
    }

    // Try sign-in first; if it fails, do sign-up.
    try {
      const si = await signIn.create({ identifier: emailInput });

      const emailFactor = si.supportedFirstFactors?.find(
        (f) => f.strategy === "email_code"
      );
      if (!emailFactor || !("emailAddressId" in emailFactor)) {
        throw new Error(
          "Email code verification is not available for sign-in."
        );
      }

      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: emailFactor.emailAddressId,
      });

      setFlow("SIGN_IN");
      return;
    } catch {
      // For sign-up custom flows, Clerk may require the captcha div in DOM.
      await signUp.create({ emailAddress: emailInput });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setFlow("SIGN_UP");
    }
  }

  async function verifyCode(code: string) {
    if (!flow) throw new Error("Flow not initialized.");
    if (!signIn || !signUp) {
      throw new Error("Sign in/up not initialized");
    }

    if (flow === "SIGN_IN") {
      const res = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code,
      });

      if (res.status !== "complete" || !res.createdSessionId) {
        throw new Error("Verification incomplete. Please try again.");
      }

      await setActive({ session: res.createdSessionId });
      return;
    }

    // SIGN_UP
    const res = await signUp.attemptEmailAddressVerification({ code });

    if (res.status !== "complete" || !res.createdSessionId) {
      throw new Error("Verification incomplete. Please try again.");
    }

    await setActive({ session: res.createdSessionId });
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      if (step === "EMAIL") {
        const e = value.trim().toLowerCase();
        setEmail(e);

        await sendCode(e);

        setStep("CODE");
        setValue(""); // reuse same input for code
        return;
      }

      // CODE
      const code = value.trim();
      await verifyCode(code);

      setStep("DONE");
      setValue("");
    } catch (err) {
      setError(getClerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!loaded || loading || !email || !signIn || !signUp) return;
    setLoading(true);
    setError(null);

    try {
      if (flow === "SIGN_IN") {
        // resend: just re-prepare factor
        const si = await signIn.create({ identifier: email });
        const emailFactor = si.supportedFirstFactors?.find(
          (f) => f.strategy === "email_code"
        );
        if (!emailFactor || !("emailAddressId" in emailFactor)) {
          throw new Error(
            "Email code verification is not available for sign-in."
          );
        }
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailFactor.emailAddressId,
        });
      } else {
        // SIGN_UP resend
        // If signUp object is in progress, preparing again typically resends
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
      }
    } catch (err) {
      setError(getClerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function resetToEmail() {
    setStep("EMAIL");
    setFlow(null);
    setEmail("");
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
      <div id="clerk-captcha" className="mt-3" />

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
