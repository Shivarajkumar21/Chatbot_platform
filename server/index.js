import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db/database.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import chatRoutes from './routes/chat.js';
import fileRoutes from './routes/files.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database
initDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/files', fileRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// DEBUG: Manual DB Init for Vercel
app.get('/api/debug/init', async (req, res) => {
  try {
    console.log('Manual DB Init Triggered');
    await initDatabase();
    res.json({ message: 'Database Initialized / Verified' });
  } catch (err) {
    console.error('Manual Init Error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// For Vercel Serverless, we must export the app
export default app;

// Only listen if not running in Vercel (PROD) or if we want to test locally
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

