"use client";

import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PaperPlaneIcon } from '@radix-ui/react-icons'; // Example icon

export interface ChatMessage {
  messageId?: string; // Optional: for React key, can be generated on client or come from server
  message: string;
  userId: string;
  username: string;
  timestamp: Date | string; // Date object or ISO string
  isOptimistic?: boolean; // Flag for optimistically added messages
}

interface ChatBoxProps {
  messages: ChatMessage[];
  currentUserId?: string; // To style user's own messages differently
  onSendMessage: (message: string) => void;
  className?: string;
  isLoading?: boolean; // To disable input if chat is not ready
}

const ChatBox: React.FC<ChatBoxProps> = ({
  messages,
  currentUserId,
  onSendMessage,
  className,
  isLoading = false,
}) => {
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null); // Ref for the viewport of ScrollArea

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const viewport = scrollAreaRef.current;
    if (viewport) {
      // The `ScrollArea` component from shadcn/ui typically has a direct child
      // that is the scrollable content.
      const scrollableContent = viewport.firstElementChild as HTMLElement;
      if (scrollableContent) {
        viewport.scrollTop = scrollableContent.scrollHeight;
      } else {
        // Fallback if the structure is different or ref is on the content itself
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  const formatDate = (timestamp: Date | string): string => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <ScrollArea className="flex-grow p-4 border rounded-md mb-4 bg-slate-50 dark:bg-slate-800" ref={scrollAreaRef}>
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            No messages yet. Start the conversation!
          </p>
        )}
        {messages.map((msg, index) => (
          <div
            key={msg.messageId || index} // Use messageId if available, otherwise index
            className={`mb-3 p-2 rounded-lg max-w-[85%] break-words ${
              msg.userId === currentUserId
                ? 'ml-auto bg-blue-500 text-white'
                : 'mr-auto bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-50'
            } ${msg.isOptimistic ? 'opacity-70' : ''}`}
          >
            <div className="text-xs font-semibold mb-0.5">
              {msg.userId === currentUserId ? 'You' : msg.username}
            </div>
            <p className="text-sm">{msg.message}</p>
            <div className={`text-xs mt-1 ${msg.userId === currentUserId ? 'text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>
              {formatDate(msg.timestamp)}
            </div>
          </div>
        ))}
      </ScrollArea>
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <Input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-grow"
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !newMessage.trim()}>
          Send <PaperPlaneIcon className="ml-2 h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};

export default ChatBox;
