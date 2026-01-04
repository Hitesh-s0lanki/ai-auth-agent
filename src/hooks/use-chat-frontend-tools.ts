"use client";

import * as React from "react";
import { z } from "zod";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";

/**
 * useChatFrontendTools()
 *
 * Client-side tool handlers meant for Vercel AI SDK `useChat({ tools })`.
 * These tools execute in the browser (required for Clerk OTP + setActive).
 *
 * Tools provided:
 * - login_user_start({ email })
 * - login_user_verify({ code })
 * - login_user_resend({})
 * - login_user_status({})
 *
 * Also returns:
 * - authState (for UI / debug)
 * - CaptchaSlot component (renders <div id="clerk-captcha" />)
 */

type AuthFlow = "SIGN_IN" | "SIGN_UP";
type AuthStep = "IDLE" | "CODE_SENT" | "DONE";

type AuthState = {
  step: AuthStep;
  flow: AuthFlow | null;
  email: string | null;
};

type ToolOk<T extends object> = { ok: true } & T;
type ToolErr = { ok: false; error: string; code?: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function clerkErrMessage(err: unknown): string {
  // Clerk errors often include `errors: [{ message: string }]`
  if (isRecord(err) && Array.isArray(err.errors) && err.errors.length > 0) {
    const first = err.errors[0];
    if (isRecord(first) && typeof first.message === "string")
      return first.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export function useChatFrontendTools() {
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const { setActive } = useClerk();

  const loaded = signInLoaded && signUpLoaded && signIn && signUp && setActive;

  const [authState, setAuthState] = React.useState<AuthState>({
    step: "IDLE",
    flow: null,
    email: null,
  });

  const getAuthState = React.useCallback(
    (): AuthState => authState,
    [authState]
  );

  const loginUserStartSchema = React.useMemo(
    () => z.object({ email: z.string().trim().toLowerCase().email() }),
    []
  );

  const loginUserVerifySchema = React.useMemo(
    () => z.object({ code: z.string().trim().min(4) }),
    []
  );

  const tools = React.useMemo(() => {
    return {
      login_user_start: {
        description:
          "Start OTP login: try sign-in first; if it fails, fallback to sign-up. Sends a code to the email.",
        parameters: loginUserStartSchema,
        execute: async ({
          email,
        }: {
          email: string;
        }): Promise<ToolOk<{ next: "ASK_CODE"; flow: AuthFlow }> | ToolErr> => {
          if (!loaded)
            return {
              ok: false,
              error: "Clerk not loaded yet.",
              code: "CLERK_NOT_LOADED",
            };

          if (!signIn || !signUp || !setActive) {
            return {
              ok: false,
              error: "Clerk not initialized.",
              code: "CLERK_NOT_INITIALIZED",
            };
          }

          // Attempt SIGN IN first
          try {
            const si = await signIn.create({ identifier: email });

            const emailFactor = si.supportedFirstFactors?.find(
              (f) => f.strategy === "email_code"
            );
            if (!emailFactor || !("emailAddressId" in emailFactor)) {
              return {
                ok: false,
                error: "Email OTP is not available for sign-in.",
                code: "NO_EMAIL_CODE",
              };
            }

            await signIn.prepareFirstFactor({
              strategy: "email_code",
              emailAddressId: emailFactor.emailAddressId,
            });

            setAuthState({ step: "CODE_SENT", flow: "SIGN_IN", email });
            return { ok: true, next: "ASK_CODE", flow: "SIGN_IN" };
          } catch {
            // Fallback SIGN UP
            try {
              await signUp.create({ emailAddress: email });
              await signUp.prepareEmailAddressVerification({
                strategy: "email_code",
              });

              setAuthState({ step: "CODE_SENT", flow: "SIGN_UP", email });
              return { ok: true, next: "ASK_CODE", flow: "SIGN_UP" };
            } catch (err) {
              return {
                ok: false,
                error: clerkErrMessage(err),
                code: "SIGNUP_FAILED",
              };
            }
          }
        },
      },

      login_user_verify: {
        description:
          "Verify OTP code and log the user in (setActive) if successful.",
        parameters: loginUserVerifySchema,
        execute: async ({
          code,
        }: {
          code: string;
        }): Promise<ToolOk<{ authenticated: true }> | ToolErr> => {
          if (!loaded)
            return {
              ok: false,
              error: "Clerk not loaded yet.",
              code: "CLERK_NOT_LOADED",
            };

          if (!signIn || !signUp || !setActive) {
            return {
              ok: false,
              error: "Clerk not initialized.",
              code: "CLERK_NOT_INITIALIZED",
            };
          }

          const state = getAuthState();
          if (state.step !== "CODE_SENT" || !state.flow || !state.email) {
            return {
              ok: false,
              error: "Login not started. Ask for email first.",
              code: "NO_ACTIVE_FLOW",
            };
          }

          try {
            if (state.flow === "SIGN_IN") {
              const res = await signIn.attemptFirstFactor({
                strategy: "email_code",
                code,
              });

              if (res.status === "complete" && res.createdSessionId) {
                await setActive({ session: res.createdSessionId });
                setAuthState({
                  step: "DONE",
                  flow: state.flow,
                  email: state.email,
                });
                return { ok: true, authenticated: true };
              }

              return {
                ok: false,
                error: `Sign-in not complete (status: ${res.status}).`,
                code:
                  res.status === "needs_second_factor"
                    ? "NEEDS_2FA"
                    : "SIGNIN_NOT_COMPLETE",
              };
            }

            // SIGN_UP
            const res = await signUp.attemptEmailAddressVerification({ code });

            if (res.status === "complete" && res.createdSessionId) {
              await setActive({ session: res.createdSessionId });
              setAuthState({
                step: "DONE",
                flow: state.flow,
                email: state.email,
              });
              return { ok: true, authenticated: true };
            }

            return {
              ok: false,
              error: `Sign-up not complete (status: ${res.status}).`,
              code:
                res.status === "missing_requirements"
                  ? "MISSING_REQUIREMENTS"
                  : "SIGNUP_NOT_COMPLETE",
            };
          } catch (err) {
            return {
              ok: false,
              error: clerkErrMessage(err),
              code: "VERIFY_FAILED",
            };
          }
        },
      },

      login_user_resend: {
        description: "Resend OTP for the current login flow.",
        parameters: z.object({}),
        execute: async (): Promise<ToolOk<{ resent: true }> | ToolErr> => {
          if (!loaded)
            return {
              ok: false,
              error: "Clerk not loaded yet.",
              code: "CLERK_NOT_LOADED",
            };

          if (!signIn || !signUp) {
            return {
              ok: false,
              error: "Clerk not initialized.",
              code: "CLERK_NOT_INITIALIZED",
            };
          }

          const state = getAuthState();
          if (state.step !== "CODE_SENT" || !state.flow || !state.email) {
            return {
              ok: false,
              error: "No active login flow to resend for.",
              code: "NO_ACTIVE_FLOW",
            };
          }

          try {
            if (state.flow === "SIGN_IN") {
              const si = await signIn.create({ identifier: state.email });
              const emailFactor = si.supportedFirstFactors?.find(
                (f) => f.strategy === "email_code"
              );
              if (!emailFactor || !("emailAddressId" in emailFactor)) {
                return {
                  ok: false,
                  error: "Email OTP not available for sign-in.",
                  code: "NO_EMAIL_CODE",
                };
              }
              await signIn.prepareFirstFactor({
                strategy: "email_code",
                emailAddressId: emailFactor.emailAddressId,
              });
            } else {
              await signUp.prepareEmailAddressVerification({
                strategy: "email_code",
              });
            }

            return { ok: true, resent: true };
          } catch (err) {
            return {
              ok: false,
              error: clerkErrMessage(err),
              code: "RESEND_FAILED",
            };
          }
        },
      },

      login_user_status: {
        description:
          "Return current auth flow state for debugging/agent planning.",
        parameters: z.object({}),
        execute: async (): Promise<ToolOk<AuthState> | ToolErr> => {
          return { ok: true, ...getAuthState() };
        },
      },
    };
  }, [
    loaded,
    signIn,
    signUp,
    setActive,
    loginUserStartSchema,
    loginUserVerifySchema,
    getAuthState,
    setAuthState,
  ]);

  const CaptchaSlot = React.useCallback(() => {
    return React.createElement("div", { id: "clerk-captcha" });
  }, []);

  return {
    tools,
    authState,
    isClerkLoaded: loaded,
    CaptchaSlot,
    resetAuthState: () =>
      setAuthState({ step: "IDLE", flow: null, email: null }),
  };
}
