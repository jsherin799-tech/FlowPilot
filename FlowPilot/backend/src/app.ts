import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Import Routes
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import taskRoutes from './routes/task.routes';
import bugRoutes from './routes/bug.routes';
import aiRoutes from './routes/ai.routes';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Dynamic Allowed Origins for Local, Render, and Vercel Deployments
const explicitOrigins = [
  ...(process.env.FRONTEND_URL ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  'http://localhost:3000',
  'http://localhost:3001',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      // Check explicit environment origins
      const isAllowedExplicit = explicitOrigins.includes(origin);
      
      // Allow any Vercel domain deployment dynamically (*.vercel.app)
      const isVercelDomain = /\.vercel\.app$/.test(origin);

      if (isAllowedExplicit || isVercelDomain) {
        return callback(null, true);
      }

      console.warn(`[CORS Blocked]: Origin ${origin} not allowed.`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  })
);

// Explicitly handle OPTIONS preflight requests globally
app.options('*', cors());

app.use(express.json());

// Health Check Endpoint (Includes DB Verification)
app.get('/api/v1/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      message: 'FlowPilot Backend Engine & Database are Online',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Backend is online, but Database connection failed',
      error: error.message,
    });
  }
});

// API v1 Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/bugs', bugRoutes);
app.use('/api/v1/ai', aiRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`FlowPilot backend listening on port ${port}`);
});

export default app;