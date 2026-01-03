"use client";

import { useState, useEffect, useMemo } from "react";
import { botttsNeutral, initials } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type GenerateAvatarProps = {
  seed: string;
  className?: string;
  variant: "botttsNeutral" | "initials";
};

export function GenerateAvatar({
  seed,
  className,
  variant,
}: GenerateAvatarProps) {
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Memoize the fallback to ensure consistency
  const fallback = useMemo(() => seed.charAt(0).toUpperCase(), [seed]);

  // Only generate avatar on client to avoid hydration mismatch
  useEffect(() => {
    // Use requestAnimationFrame to ensure this runs after initial render
    const rafId = requestAnimationFrame(() => {
      setIsMounted(true);
      let avatar;

      if (variant === "botttsNeutral") {
        avatar = createAvatar(botttsNeutral, { seed });
      } else {
        avatar = createAvatar(initials, {
          seed,
          fontWeight: 500,
          fontSize: 42,
          backgroundColor: ["1e2235", "2a3047", "3a4160"],
        });
      }

      setAvatarUri(avatar.toDataUri());
    });

    return () => cancelAnimationFrame(rafId);
  }, [seed, variant]);

  // Always render the same structure to avoid hydration mismatch
  // The AvatarImage will only show when avatarUri is available
  return (
    <Avatar className={className}>
      {isMounted && avatarUri ? (
        <AvatarImage src={avatarUri} alt={seed} />
      ) : null}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  );
}
