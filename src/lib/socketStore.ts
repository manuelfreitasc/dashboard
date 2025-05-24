import { create } from 'zustand';
import io, { Socket } from 'socket.io-client';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connect: (token: string | null) => void;
  disconnect: () => void;
  emit: (event: string, ...args: any[]) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  off: (event: string, listener?: (...args: any[]) => void) => void;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  connect: (token) => {
    if (get().socket) {
      // Already connected or connecting
      return;
    }

    console.log('Attempting to connect to socket server...');
    const newSocket = io(SOCKET_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: token ? { token } : {},
      autoConnect: true, // Explicitly set autoConnect
    });

    newSocket.on('connect', () => {
      set({ socket: newSocket, isConnected: true });
      console.log('Socket connected:', newSocket.id);
    });

    newSocket.on('disconnect', (reason) => {
      set({ isConnected: false });
      console.log('Socket disconnected:', reason);
      // newSocket.removeAllListeners(); // Clean up listeners on final disconnect
      // set({ socket: null }); // Maybe set socket to null after full disconnect
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      // Potentially disconnect and nullify socket if auth fails or too many retries
      // newSocket.disconnect();
      // set({ socket: null, isConnected: false });
    });
    
    // Does not get set immediately, so we set it here.
    // It will be updated by the event handlers above.
    set({socket: newSocket}); 
  },
  disconnect: () => {
    const currentSocket = get().socket;
    if (currentSocket) {
      console.log('Disconnecting socket...');
      currentSocket.disconnect();
      currentSocket.removeAllListeners();
      set({ socket: null, isConnected: false });
    }
  },
  emit: (event, ...args) => {
    const currentSocket = get().socket;
    if (currentSocket && currentSocket.connected) {
      currentSocket.emit(event, ...args);
    } else {
      console.warn(`Socket not connected or not available. Cannot emit event: ${event}`);
    }
  },
  on: (event, listener) => {
    const currentSocket = get().socket;
    if (currentSocket) {
      currentSocket.on(event, listener);
    }
  },
  off: (event, listener) => {
    const currentSocket = get().socket;
    if (currentSocket) {
      currentSocket.off(event, listener);
    }
  },
}));

// Helper to get token from localStorage (assuming this is where you store it)
export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('authToken'); // Adjust if your token is stored elsewhere
};
