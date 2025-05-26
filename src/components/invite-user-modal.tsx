import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore'; // Import useAuthStore
import { toast } from 'sonner'; // For toast notifications
import { RefreshCw } from 'lucide-react'; // For loading spinner icon

interface UserSearchResult {
  id: string;
  username: string;
  invited?: boolean; // To track if user has been invited in current session
}

interface InviteUserModalProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
}

const InviteUserModal: React.FC<InviteUserModalProps> = ({
  roomId,
  isOpen,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState<boolean>(false);
  const [isLoadingInvite, setIsLoadingInvite] = useState<string | null>(null); // Store userId of user being invited
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { getAuthToken } = useAuthStore();

  // Clear message and state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setSearchTerm('');
      setSearchResults([]);
      setIsLoadingInvite(null);
    }
  }, [isOpen]);

  const handleSearchUsers = async () => {
    setMessage(null); // Clear previous messages
    setSearchResults([]); // Clear previous results

    if (searchTerm.trim().length < 2) {
      setMessage({ type: 'error', text: 'Search term must be at least 2 characters long.' });
      setSearchResults([]);
      return;
    }

    setIsLoadingSearch(true);
    const token = getAuthToken();
    if (!token) {
      setMessage({ type: 'error', text: 'Authentication token not found.' });
      setIsLoadingSearch(false);
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"}/auth/users/search?q=${encodeURIComponent(searchTerm.trim())}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setSearchResults(data);
        if (data.length === 0) {
          setMessage({ type: 'error', text: `No users found matching "${searchTerm}".` });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to search for users.' });
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search users error:', error);
      setMessage({ type: 'error', text: 'An error occurred while searching for users.' });
      setSearchResults([]);
    } finally {
      setIsLoadingSearch(false);
    }
  };

  const handleInviteUser = async (userIdToInvite: string, username: string) => {
    setMessage(null); // Clear previous messages
    setIsLoadingInvite(userIdToInvite); // Set loading for this specific user
    const token = getAuthToken();

    if (!token) {
      setMessage({ type: 'error', text: 'Authentication token not found.' });
      setIsLoadingInvite(null);
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"}/rooms/${roomId}/participants`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: userIdToInvite }),
        }
      );

      const responseData = await response.json();

      if (response.ok) { // Status 201 Created
        setMessage({ type: 'success', text: `Successfully invited ${username} to the room.` });
        toast.success(`User ${username} invited!`);
        setSearchResults(prevResults =>
          prevResults.map(user =>
            user.id === userIdToInvite ? { ...user, invited: true } : user
          )
        );
      } else {
        // Handle specific API error messages
        let errorMsg = responseData.error || 'Failed to invite user.';
        if (response.status === 403) errorMsg = "You are not authorized to invite users to this room.";
        else if (response.status === 404 && responseData.error?.includes('User to invite not found')) errorMsg = "User to invite not found.";
        else if (response.status === 404 && responseData.error?.includes('Room not found')) errorMsg = "Room not found. Please refresh.";
        else if (response.status === 409) errorMsg = `${username} is already a participant in this room.`;
        
        setMessage({ type: 'error', text: errorMsg });
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('Invite user error:', error);
      const errorText = 'An error occurred while inviting the user.';
      setMessage({ type: 'error', text: errorText });
      toast.error(errorText);
    } finally {
      setIsLoadingInvite(null); // Clear loading for this specific user
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Invite Users to Room</DialogTitle>
          <DialogDescription>
            Search for users by their username and invite them to join this room.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center space-x-2">
            <Input
              id="searchTerm"
              placeholder="Enter username (min 2 chars)..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                // Optionally clear message on new input to allow re-search after error
                if (message && message.text === 'Search term must be at least 2 characters long.') {
                    setMessage(null);
                }
              }}
              onKeyPress={(e) => { if (e.key === 'Enter' && !isLoadingSearch) handleSearchUsers(); }}
              className="flex-1"
              disabled={isLoadingSearch}
            />
            <Button onClick={handleSearchUsers} disabled={isLoadingSearch || searchTerm.trim().length < 2}>
              {isLoadingSearch ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </Button>
          </div>

          {message && (
            <div
              className={cn(
                'p-2 my-2 rounded-md text-sm text-center',
                message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              )}
            >
              {message.text}
            </div>
          )}

          <ScrollArea className="h-[200px] w-full rounded-md border">
            <div className="p-4">
              {isLoadingSearch && searchResults.length === 0 && <p className="text-sm text-muted-foreground text-center">Searching for users...</p>}
              {!isLoadingSearch && searchResults.length === 0 && searchTerm && !message && (
                <p className="text-sm text-muted-foreground text-center">No users found matching "{searchTerm}".</p>
              )}
              {!isLoadingSearch && searchResults.length === 0 && !searchTerm && !message && (
                <p className="text-sm text-muted-foreground text-center">Enter a username above to search.</p>
              )}
              {searchResults.map((user) => (
                <div key={user.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <span className={cn(user.invited && "text-slate-400 dark:text-slate-500")}>{user.username}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleInviteUser(user.id, user.username)}
                    disabled={isLoadingInvite === user.id || user.invited}
                  >
                    {isLoadingInvite === user.id ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Inviting...
                      </>
                    ) : user.invited ? (
                      'Invited'
                    ) : (
                      'Invite'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserModal;
