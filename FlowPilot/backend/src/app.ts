import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from './middleware/auth.middleware';

// Import Routes
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import taskRoutes from './routes/task.routes';
import bugRoutes from './routes/bug.routes';
import sprintRoutes from './routes/sprint.routes';
import aiRoutes from './routes/ai.routes';
import notificationRoutes from './routes/notification.routes';
import activityRoutes from './routes/activity.routes';
import adminRoutes from './routes/admin.routes';
import pmRoutes from './routes/pm.routes';
import developerRoutes from './routes/developer.routes';
import qaRoutes from './routes/qa.routes';

const app = express();
const prisma = new PrismaClient();
const httpServer = http.createServer(app);

// ─── CORS ────────────────────────────────────────────────────────────────────
const explicitOrigins = [
  ...(process.env.FRONTEND_URL ?? '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),
  'http://localhost:3000',
  'http://localhost:3001',
];

function isAllowedFrontendOrigin(origin: string): boolean {
  return explicitOrigins.includes(origin)
    || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)
    || /\.vercel\.app$/.test(origin);
}

function checkCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin || isAllowedFrontendOrigin(origin)) {
    callback(null, true);
    return;
  }
  console.warn(`[CORS Blocked]: ${origin}`);
  callback(new Error('Not allowed by CORS'));
}

const corsOptions = {
  origin: checkCorsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: checkCorsOrigin,
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (typeof token !== 'string') {
    next(new Error('Authentication required.'));
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded === 'string' || typeof decoded.userId !== 'string') {
      next(new Error('Invalid authentication token.'));
      return;
    }
    socket.data.userId = decoded.userId;
    next();
  } catch {
    next(new Error('Invalid or expired authentication token.'));
  }
});

// Store io instance for use in controllers
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  const userId = socket.data.userId as string;
  socket.join(`user:${userId}`);

  socket.on('join:project', async (projectId: unknown) => {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      socket.emit('project:join:error', { message: 'A valid project ID is required.' });
      return;
    }
    try {
      const membership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { id: true },
      });
      if (!membership) {
        socket.emit('project:join:error', { message: 'You are not a member of this project.' });
        return;
      }
      socket.join(`project:${projectId}`);
      console.log(`[Socket.IO] ${socket.id} joined project:${projectId}`);
    } catch (error) {
      console.error('[Socket.IO] Project room authorization failed:', error);
      socket.emit('project:join:error', { message: 'Unable to join project updates.' });
    }
  });

  socket.on('leave:project', (projectId: string) => {
    socket.leave(`project:${projectId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/v1/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      message: 'FlowPilot Backend Engine & Database are Online',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Backend online, database connection failed',
      error: error.message,
    });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/bugs', bugRoutes);
app.use('/api/v1/sprints', sprintRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/activity', activityRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/pm', pmRoutes);
app.use('/api/v1/developer', developerRoutes);
app.use('/api/v1/qa', qaRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Unhandled Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[Backend] Port ${PORT} is already in use. Stop the other service or set PORT to an available port.`);
  } else {
    console.error('[Backend] Failed to start:', error);
  }
  process.exitCode = 1;
});

httpServer.listen(PORT, () => {
  console.log(`\n🚀 FlowPilot Backend running on port ${PORT}`);
  console.log(`📡 Socket.IO enabled`);
  console.log(`🌍 Health: http://localhost:${PORT}/api/v1/health\n`);
});

export default app;
export { io };