"use client"; // Required for pages that use client components like forms with state

import { SignupForm } from '@/components/signup-form'; // Adjust path if necessary

export default function SignupPage() {
  return (
    <div className="container mx-auto flex items-center justify-center min-h-screen p-4">
      <SignupForm />
    </div>
  );
}
