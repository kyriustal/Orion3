import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Orion 2 Backend is running successfully!' });
});

// API Routes
import authRoutes from './api/auth.routes';
import knowledgeRoutes from './api/knowledge.routes';
import whatsappRoutes from './api/whatsapp.routes';
import chatRoutes from './api/chat.routes';
import coreRoutes from './api/core.routes';

app.use('/api/auth', authRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/orion-web', chatRoutes);
app.use('/api', coreRoutes); // General CRUD

// Serve static frontend in production
const frontendPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendPath));

// Fallback to React Router for all other requests
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
