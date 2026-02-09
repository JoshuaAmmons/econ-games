import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

export function useSocket(sessionCode: string, playerId: string) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Join session and market rooms
      socket.emit('join-session', { sessionCode, playerId });
      socket.emit('join-market', { sessionCode, playerId });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionCode, playerId]);

  const submitBid = useCallback((roundId: string, price: number) => {
    socketRef.current?.emit('submit-bid', {
      roundId,
      playerId,
      price,
      sessionCode,
    });
  }, [playerId, sessionCode]);

  const submitAsk = useCallback((roundId: string, price: number) => {
    socketRef.current?.emit('submit-ask', {
      roundId,
      playerId,
      price,
      sessionCode,
    });
  }, [playerId, sessionCode]);

  const onEvent = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
    return () => {
      socketRef.current?.off(event, callback);
    };
  }, []);

  return {
    socket: socketRef.current,
    connected,
    submitBid,
    submitAsk,
    onEvent,
  };
}
