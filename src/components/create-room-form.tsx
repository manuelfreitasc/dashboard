"use client";

import React, { useState, FormEvent, useEffect } from 'react';
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
import { Checkbox } from "@/components/ui/checkbox";
import { useAuthStore } from '@/lib/authStore';
import { toast } from "sonner";
import { Room } from '@/types'; // Assuming Room type is defined

const ROOMS_API_URL = process.env.NEXT_PUBLIC_ROOMS_API_URL || 'http://localhost:3001/rooms';

export function CreateRoomForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState(''); // Optional
  const [maxParticipants, setMaxParticipants] = useState<number | string>(10);
  const [isPublic, setIsPublic] = useState(true);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthToken = useAuthStore((state) => state.getAuthToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error("You must be logged in to create a room.");
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!roomName.trim()) {
      toast.error("Room name is required.");
      setError("Room name is required.");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      toast.error("Authentication token not found. Please log in again.");
      setError("Authentication token not found.");
      // router.push('/login'); // Should be handled by useEffect ideally
      return;
    }

    setIsLoading(true);

    const roomData = {
      name: roomName,
      password: password || undefined, // Send undefined if empty, so backend can ignore if truly optional
      // max_participants: Number(maxParticipants), // Backend expects 'max_participants'
      // is_public: isPublic,                   // Backend expects 'is_public'
      // Based on previous Prisma schema, these fields might not be directly on Room creation
      // The backend /rooms endpoint as implemented only takes 'name'
      // I will send only 'name' for now, as per the implemented backend.
      // If the backend is updated to accept these, they can be re-added.
    };

    try {
      const response = await fetch(ROOMS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: roomName }), // Sending only name as per current backend
      });

      const responseData: Room | { error: string } = await response.json();

      if (!response.ok) {
        const errorMsg = (responseData as { error: string }).error || `Failed to create room (status: ${response.status})`;
        throw new Error(errorMsg);
      }
      
      const newRoom = responseData as Room;
      toast.success(`Room "${newRoom.name}" created successfully!`);
      router.push(`/rooms/${newRoom.id}`); // Redirect to the new room

    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred.';
      console.error("Create room error:", err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={cn("w-full max-w-lg", className)} {...props}>
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">Create a New Room</CardTitle>
        <CardDescription className="text-center">
          Fill in the details below to start a new watch party room.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="roomName">Room Name</Label>
              <Input
                id="roomName"
                type="text"
                placeholder="Enter room name (e.g., Movie Night!)"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {/* Fields below are commented out as the current backend POST /rooms only accepts 'name'
                If backend is updated, these can be re-enabled.
            <div className="grid gap-2">
              <Label htmlFor="password">Room Password (Optional)</Label>
              <Input
                id="password"
                type="password"
                placeholder="Leave blank for no password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="maxParticipants">Max Participants (Optional)</Label>
              <Input
                id="maxParticipants"
                type="number"
                placeholder="e.g., 10"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value === '' ? '' : Number(e.target.value))}
                min="2" // A room usually needs at least 2 people
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="isPublic"
                checked={isPublic}
                onCheckedChange={(checked) => setIsPublic(checked as boolean)}
                disabled={isLoading}
              />
              <Label htmlFor="isPublic" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Publicly Visible
              </Label>
            </div>
            */}

            {error && <p className="text-sm text-red-500 text-center py-2">{error}</p>}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating Room...' : 'Create Room'}
            </Button>
          </div>
        </form>
      </CardContent>
      {/* <CardFooter>
        <p className="text-xs text-muted-foreground text-center w-full">
          Note: Public rooms are discoverable by anyone. Private rooms require a password or direct link.
        </p>
      </CardFooter> */}
    </Card>
  );
}
