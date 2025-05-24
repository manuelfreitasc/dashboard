"use client"; // Required because we'll use a hook (useAuthStore)

import Link from 'next/link';
"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation'; // Import useRouter
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModeToggle } from "./toogle-theme";
import { useAuthStore } from '@/lib/authStore';
import { PlusCircledIcon, ExitIcon } from '@radix-ui/react-icons'; // Added ExitIcon
import { toast } from 'sonner';

export function SiteHeader() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();

  const handleLogout = () => {
    logout();
    toast.success("You have been logged out.");
    router.push('/login'); // Redirect to login page after logout
  };

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 h-6" />
      
      <div className="ml-auto flex items-center gap-3">
        {isAuthenticated && (
          <>
            <Link href="/rooms/create" passHref>
              <Button variant="outline" size="sm">
                <PlusCircledIcon className="mr-2 h-4 w-4" />
                Create Room
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <ExitIcon className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </>
        )}
        <ModeToggle />
        {/* UserNav or similar component could go here to display username/avatar */}
      </div>
    </header>
  );
}
