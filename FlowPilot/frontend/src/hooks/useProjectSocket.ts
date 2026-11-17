'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Task } from '@/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

export interface TaskUpdatedEvent {
  taskId:    string;
  title:     string;
  oldStatus: string;
  newStatus: string;
  projectId: string;
  updatedBy: { id: string };
  task:      Task;
}

interface UseProjectSocketOptions {
  projectId:     string;
  onTaskUpdated: (event: TaskUpdatedEvent) => void;
}

/**
 * Connects to the FlowPilot Socket.IO server, joins the project room,
 * and forwards `task:updated` events to the provided callback.
 */
export function useProjectSocket({ projectId, onTaskUpdated }: UseProjectSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const onTaskUpdatedRef = useRef(onTaskUpdated);
  const [connected, setConnected] = useState(false);

  // Keep callback ref current without re-subscribing
  useEffect(() => {
    onTaskUpdatedRef.current = onTaskUpdated;
  }, [onTaskUpdated]);

  useEffect(() => {
    if (!projectId) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('flowpilot_token') : null;

    const socket = io(SOCKET_URL, {
      auth:           { token },
      transports:     ['websocket', 'polling'],
      reconnectionDelay:       1000,
      reconnectionDelayMax:    5000,
      reconnectionAttempts:    10,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log(`[Socket.IO] Connected – joining project:${projectId}`);
      socket.emit('join:project', projectId);
    });

    socket.on('task:updated', (event: TaskUpdatedEvent) => {
      onTaskUpdatedRef.current(event);
    });

    socket.on('connect_error', (err) => {
      setConnected(false);
      console.warn('[Socket.IO] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      console.log('[Socket.IO] Disconnected:', reason);
    });

    return () => {
      socket.emit('leave:project', projectId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [projectId]);

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { emit, connected };
}
