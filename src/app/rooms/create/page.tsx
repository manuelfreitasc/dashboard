"use client";

import React from 'react';
import { CreateRoomForm } from '@/components/create-room-form'; // Will create this component next

export default function CreateRoomPage() {
  return (
    <div className="container mx-auto flex flex-col items-center justify-center min-h-screen p-4">
      <CreateRoomForm />
    </div>
  );
}
