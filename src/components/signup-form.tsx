"use client";

import React, { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { useAuthStore } from '@/lib/authStore';
import { toast } from "sonner";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Email field can be added if your backend /auth/register expects it.
  // For this example, assuming username and password only for simplicity, matching current backend.
  // const [email, setEmail] = useState(''); 

  const signup = useAuthStore((state) => state.signup);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const router = useRouter();

  useEffect(() => {
    // Clear errors when the component mounts or unmounts
    clearError();
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();

    if (!username || !password || !confirmPassword) {
      toast.error("All fields are required.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    // Include email in the payload if your backend /auth/register uses it
    // const success = await signup({ username, email, password }); 
    const success = await signup({ username, password });


    if (success) {
      toast.success("Signup successful! You are now logged in.");
      router.push('/dashboard'); // Redirect to dashboard or desired page
    } else {
      // Error is handled by the store and displayed, or use toast
      // toast.error(error || "Signup failed. Please try again.");
    }
  };

  return (
    <div className={cn("flex flex-col items-center justify-center min-h-screen py-12", className)} {...props}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
          <CardDescription>
            Enter your details to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="yourusername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              {/* Uncomment if email is needed for registration
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              */}
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input 
                  id="confirm-password" 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required 
                  disabled={isLoading}
                />
              </div>
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing up...' : 'Sign Up'}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
            <div className="text-center text-sm">
                Already have an account?{" "}
                <Link href="/login" className="underline underline-offset-4 hover:text-primary">
                    Login
                </Link>
            </div>
            <div className="text-muted-foreground text-center text-xs text-balance">
                 By signing up, you agree to our <Link href="#" className="underline hover:text-primary">Terms</Link> & <Link href="#" className="underline hover:text-primary">Policy</Link>.
            </div>
        </CardFooter>
      </Card>
    </div>
  );
}
