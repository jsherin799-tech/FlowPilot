import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import Routes
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import taskRoutes from './routes/task.routes';
import bugRoutes from './routes/bug.routes';
import aiRoutes from './routes/ai.routes';

dotenv.config();

const app = express();

// Enable CORS for Next.js Frontend
app.use(
  cors({
    origin: [process.env.FRONTEND_URL, 'http://localhost:3000'].filter(
      (origin): origin is string => Boolean(origin)
    ),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// Health Check Endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'FlowPilot Backend Engine is Online' });
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
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`FlowPilot backend listening on port ${port}`);
});

export default app;