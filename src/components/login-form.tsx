"use client";

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from '@/lib/authStore'; // Import the auth store
import { toast } from "sonner";
import Link from 'next/link'; // For "Sign up" link

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [username, setUsername] = useState(''); // Can be username or email
  const [password, setPassword] = useState('');
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError(); // Clear previous errors

    if (!username || !password) {
      toast.error("Username and password are required.");
      return;
    }

    const success = await login({ username, password });

    if (success) {
      toast.success("Login successful!");
      router.push('/dashboard'); // Redirect to dashboard or desired page
    } else {
      // Error is handled by the store and displayed below, or use toast if preferred
      // toast.error(error || "Login failed. Please check your credentials.");
    }
  };
  
  // Clear error when component unmounts or username/password changes
  React.useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);


  return (
    <div className={cn("flex flex-col items-center justify-center min-h-screen py-12", className)} {...props}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>
            Enter your credentials to access your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4">
              {/* Social login buttons removed for simplicity, can be added back if needed */}
              {/* <div className="flex flex-col gap-4">
                <Button variant="outline" className="w-full" type="button">Login with Apple</Button>
                <Button variant="outline" className="w-full" type="button">Login with Google</Button>
              </div>
              <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                <span className="bg-card text-muted-foreground relative z-10 px-2">Or continue with</span>
              </div> */}
              <div className="grid gap-2">
                <Label htmlFor="username">Username or Email</Label>
                <Input
                  id="username"
                  type="text" // Changed from email to text to allow username
                  placeholder="yourname or you@example.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  {/* <Link href="#" className="ml-auto text-sm underline-offset-4 hover:underline">
                    Forgot your password?
                  </Link> */}
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
            <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="underline underline-offset-4 hover:text-primary">
                    Sign up
                </Link>
            </div>
            <div className="text-muted-foreground text-center text-xs text-balance">
                By continuing, you agree to our <Link href="#" className="underline hover:text-primary">Terms of Service</Link>{" "}
                and <Link href="#" className="underline hover:text-primary">Privacy Policy</Link>.
            </div>
        </CardFooter>
      </Card>
    </div>
  );
}
