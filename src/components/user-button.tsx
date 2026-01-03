"use client";

import { useState, useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Settings, User } from "lucide-react";
import { useUser, useClerk } from "@clerk/nextjs";
import { GenerateAvatar } from "@/components/ui/generate-avatar";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

export function UserButton() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [isMounted, setIsMounted] = useState(false);

  // Delay rendering DropdownMenu until after mount to prevent hydration mismatch
  // Radix UI generates dynamic IDs that differ between server and client
  useEffect(() => {
    startTransition(() => {
      setIsMounted(true);
    });
  }, []);

  if (!isLoaded || !user) {
    return null;
  }

  const getUserName = () => {
    if (user.fullName) return user.fullName;
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) return user.firstName;
    return user.emailAddresses[0]?.emailAddress || "User";
  };

  const getUserEmail = () => {
    return user.emailAddresses[0]?.emailAddress || "";
  };

  const onLogout = async () => {
    await signOut();
    router.refresh();
  };

  if (isMobile) {
    return (
      <>
        <Drawer>
          <DrawerTrigger>
            <GenerateAvatar
              seed={getUserName()}
              variant="initials"
              className="size-9"
            />
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{getUserName()}</DrawerTitle>
              <DrawerDescription>{getUserEmail()}</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button variant="outline" onClick={() => signOut()}>
                <LogOut className="size-4 mr-2" />
                Logout
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      {isMounted ? (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <GenerateAvatar
              seed={getUserName()}
              variant="initials"
              className="size-8"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" className="w-72">
            <DropdownMenuItem
              className="flex cursor-pointer items-center justify-between"
              onClick={onLogout}
              variant="destructive"
            >
              Logout
              <LogOut className="size-4" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <GenerateAvatar
          seed={getUserName()}
          variant="initials"
          className="size-8"
        />
      )}
    </>
  );
}
