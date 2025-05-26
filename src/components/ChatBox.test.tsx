import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatBox, { ChatMessage } from './ChatBox'; // Assuming ChatMessage is exported or defined here/imported
import '@testing-library/jest-dom'; // For toHaveTextContent, etc.

describe('ChatBox Component', () => {
  const mockMessages: ChatMessage[] = [
    { messageId: '1', message: 'Hello there!', userId: 'user1', username: 'UserOne', timestamp: new Date() },
    { messageId: '2', message: 'Hi!', userId: 'user2', username: 'UserTwo', timestamp: new Date(), isOptimistic: true },
  ];

  const currentUserId = 'user1';
  const onSendMessageMock = vi.fn();

  it('renders messages correctly', () => {
    render(
      <ChatBox
        messages={mockMessages}
        currentUserId={currentUserId}
        onSendMessage={onSendMessageMock}
      />
    );

    // Check if messages are displayed
    expect(screen.getByText('Hello there!')).toBeInTheDocument();
    expect(screen.getByText('Hi!')).toBeInTheDocument();

    // Check usernames (simplified, actual display might include "You")
    expect(screen.getByText('You')).toBeInTheDocument(); // For currentUserId's message
    expect(screen.getByText('UserTwo')).toBeInTheDocument();
  });

  it('styles current user messages differently (checks for specific class if applicable, or structure)', () => {
    const { container } = render(
      <ChatBox
        messages={mockMessages}
        currentUserId={currentUserId}
        onSendMessage={onSendMessageMock}
      />
    );
    // Example: UserOne's message should have 'ml-auto' (tailwind class for own messages in ChatBox.tsx)
    const userOneMessage = screen.getByText('Hello there!').closest('div.mb-3'); // Find the parent message div
    expect(userOneMessage).toHaveClass('ml-auto');
    
    // UserTwo's message should have 'mr-auto'
    const userTwoMessage = screen.getByText('Hi!').closest('div.mb-3');
    expect(userTwoMessage).toHaveClass('mr-auto');
  });
  
  it('shows optimistic messages with different styling (e.g., opacity)', () => {
    render(
      <ChatBox
        messages={mockMessages}
        currentUserId={currentUserId}
        onSendMessage={onSendMessageMock}
      />
    );
    const optimisticMessage = screen.getByText('Hi!').closest('div.mb-3');
    expect(optimisticMessage).toHaveClass('opacity-70');
  });


  it('calls onSendMessage when send button is clicked with a message', () => {
    render(
      <ChatBox
        messages={[]}
        currentUserId={currentUserId}
        onSendMessage={onSendMessageMock}
      />
    );

    const inputElement = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(inputElement, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    expect(onSendMessageMock).toHaveBeenCalledTimes(1);
    expect(onSendMessageMock).toHaveBeenCalledWith('Test message');
    expect((inputElement as HTMLInputElement).value).toBe(''); // Input should clear after sending
  });

  it('does not call onSendMessage if message is empty or only whitespace', () => {
    render(
      <ChatBox
        messages={[]}
        currentUserId={currentUserId}
        onSendMessage={onSendMessageMock}
      />
    );

    const sendButton = screen.getByRole('button', { name: /send/i });
    const inputElement = screen.getByPlaceholderText('Type your message...');

    // Test with empty message
    fireEvent.click(sendButton);
    expect(onSendMessageMock).not.toHaveBeenCalled();

    // Test with whitespace message
    fireEvent.change(inputElement, { target: { value: '   ' } });
    fireEvent.click(sendButton);
    expect(onSendMessageMock).not.toHaveBeenCalled();
  });
  
  it('displays "No messages yet" when messages array is empty', () => {
    render(
        <ChatBox
            messages={[]}
            currentUserId={currentUserId}
            onSendMessage={onSendMessageMock}
        />
    );
    expect(screen.getByText('No messages yet. Start the conversation!')).toBeInTheDocument();
  });

  it('disables input and button when isLoading is true', () => {
    render(
        <ChatBox
            messages={[]}
            currentUserId={currentUserId}
            onSendMessage={onSendMessageMock}
            isLoading={true}
        />
    );
    expect(screen.getByPlaceholderText('Type your message...')).toBeDisabled();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

});
