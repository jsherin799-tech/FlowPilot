import type { Notification } from '@prisma/client';
import type { Server } from 'socket.io';

export function emitUserNotification(io: Server | undefined, notification: Notification): void {
  io?.to(`user:${notification.userId}`).emit('notification:new', notification);
}
