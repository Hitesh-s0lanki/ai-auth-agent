import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Shield, Lock, Key } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Left / Brand panel */}
      <div className="relative hidden w-0 flex-1 flex-col justify-between border-r border-slate-200 bg-slate-950 px-10 py-8 text-slate-50 lg:flex lg:w-[52%]">
        {/* Top nav-ish */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Link>

          <div className="flex items-center gap-2">
            <div className="relative h-9 w-9">
              <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl" />
              <Image
                src="/logo.png"
                alt="Auth Agent"
                fill
                className="relative rounded-2xl object-contain"
              />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              AuthAgent
            </span>
          </div>
        </div>

        {/* Center content */}
        <div className="space-y-6 w-full px-10">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
            <Shield className="h-3.5 w-3.5 text-amber-300" />
            Secure authentication made simple
          </p>

          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Sign in to your
              <br />
              <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
                secure account.
              </span>
            </h1>
            <p className="max-w-md text-sm text-slate-300">
              Auth Agent helps you authenticate users quickly and securely. Get
              started by signing in or creating a new account.
            </p>
          </div>

          {/* Video showcase */}
          <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
            >
              <source src="/auth-agent.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-white" />
              <span>
                Secure authentication with industry-standard encryption.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-white" />
              <span>Easy sign-in and sign-up process.</span>
            </div>
          </div>
        </div>

        {/* Bottom mini-note */}
        <div className="text-[11px] text-slate-500 px-10">
          By continuing, you agree to our{" "}
          <Link
            href="/terms"
            className="text-slate-300 underline-offset-2 hover:underline"
          >
            Terms
          </Link>{" "}
          &{" "}
          <Link
            href="/privacy"
            className="text-slate-300 underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </div>

      {/* Right / Auth panel */}
      <div className="flex min-h-screen w-full flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:w-[48%] lg:px-10">
        {children}
      </div>
    </div>
  );
}
