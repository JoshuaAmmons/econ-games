import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

export function useSocket(sessionCode: string, playerId: string) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionCode || !playerId) return;

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
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

    socket.on('reconnect', () => {
      // Re-join rooms on reconnect
      socket.emit('join-session', { sessionCode, playerId });
      socket.emit('join-market', { sessionCode, playerId });
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

  const submitAction = useCallback((roundId: string, action: Record<string, any>) => {
    socketRef.current?.emit('submit-action', {
      roundId,
      playerId,
      sessionCode,
      action,
    });
  }, [playerId, sessionCode]);

  const requestGameState = useCallback((roundId: string) => {
    socketRef.current?.emit('get-game-state', {
      sessionCode,
      roundId,
      playerId,
    });
  }, [playerId, sessionCode]);

  const onEvent = useCallback((event: string, callback: (...args: any[]) => void) => {
    const socket = socketRef.current;
    if (!socket) return () => {};

    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  }, [connected]); // re-create when connection state changes

  return {
    socket: socketRef.current,
    connected,
    submitBid,
    submitAsk,
    submitAction,
    requestGameState,
    onEvent,
  };
}
