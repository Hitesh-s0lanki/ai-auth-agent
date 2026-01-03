"use client";

import Image from "next/image";

export function ChatEmpty() {
  return (
    <div className="flex h-full items-center justify-center py-40 ">
      <div className="text-center">
        <div className="mx-auto mb-6 flex items-center justify-center rounded-full bg-white from-primary/20 to-primary/10">
          <Image src="/logo.png" alt="Auth Agent" width={144} height={144} />
        </div>
        <p className="text-xl font-semibold text-foreground">
          Start a conversation
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask me anything and I&apos;ll help you out!
        </p>
      </div>
    </div>
  );
}
