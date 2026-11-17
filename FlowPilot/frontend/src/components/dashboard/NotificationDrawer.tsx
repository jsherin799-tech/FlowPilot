'use client';

import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCheck, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Notification } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

const NOTIF_ICON: Record<string, string> = {
  TASK_ASSIGNED:       '📋',
  TASK_STATUS_UPDATED: '🔄',
  BUG_REPORTED:        '🐛',
  BUG_RESOLVED:        '✅',
  SPRINT_STARTED:      '🚀',
  SPRINT_COMPLETED:    '🏁',
  COMMENT_ADDED:       '💬',
  MEMBER_ADDED:        '👤',
};

export default function NotificationDrawer() {
  const [open, setOpen]                     = useState(false);
  const [notifications, setNotifications]   = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]       = useState(0);
  const [loading, setLoading]               = useState(false);
  const [loadError, setLoadError]           = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications');
      if (data.success) {
        setNotifications(data.data.notifications);
        setUnreadCount(data.data.unreadCount);
        setLoadError(false);
      }
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    // Initial data is loaded asynchronously; polling provides a fallback to socket events.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchNotifications();
    // Poll every 30s for new notifications
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('flowpilot_token');
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socket.on('notification:new', (notification: Notification) => {
      setNotifications((current) => [
        notification,
        ...current.filter((item) => item.id !== notification.id),
      ].slice(0, 50));
      if (!notification.isRead) setUnreadCount((count) => count + 1);
    });
    socket.on('connect_error', (error) => {
      console.warn('[Socket.IO] Notification connection error:', error.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/mark-all-read');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { setLoadError(true); }
  };

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { setLoadError(true); }
  };

  return (
    <>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse-slow">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/60 z-40 animate-slide-in overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-200">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
                  >
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-400 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-800">
              {loadError && (
                <div role="alert" className="px-4 py-2 text-[11px] text-rose-400">
                  Notifications could not be refreshed. We’ll retry automatically.
                </div>
              )}
              {loading && notifications.length === 0 ? (
                <div className="py-8 flex justify-center text-slate-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center text-slate-600 text-sm">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => !n.isRead && markRead(n.id)}
                    className={`flex gap-3 px-4 py-3 transition cursor-default ${
                      n.isRead ? '' : 'bg-indigo-500/5 hover:bg-indigo-500/10 cursor-pointer'
                    }`}
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">{NOTIF_ICON[n.type] || '🔔'}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium ${n.isRead ? 'text-slate-400' : 'text-slate-200'}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-slate-700 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.isRead && (
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
