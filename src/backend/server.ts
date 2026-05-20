import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { initSocket } from './socket';

console.log(`[BOOT] Carregando .env de: ${path.join(process.cwd(), '.env')}`);

// Inicialização
const app        = express();
const httpServer = createServer(app);
const PORT       = process.env.PORT || 3000;

// Inicializar Socket.io (singleton disponível globalmente via getIo())
initSocket(httpServer);

// Middleware Global
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', server: 'Orion Backend', version: '3.0.0', ai: 'Gemini 2.5 Flash' });
});

// ─── Rotas ────────────────────────────────────────────────────────────────────
import authRoutes        from './api/auth.routes';
import knowledgeRoutes   from './api/knowledge.routes';
import chatRoutes        from './api/chat.routes';
import coreRoutes        from './api/core.routes';
import whatsappRoutes    from './api/whatsapp.routes';
import facebookRoutes    from './api/facebook.routes';
import instagramRoutes   from './api/instagram.routes';
import bookingsRoutes    from './api/bookings.routes';
import automationsRoutes from './api/automations.routes';
import templatesRoutes   from './api/templates.routes';
import campaignsRoutes   from './api/campaigns.routes';
import billingRoutes     from './api/billing.routes';
import instructionsRoutes from './api/instructions.routes';
import assetsRoutes from './api/assets.routes';
import teamRoutes from './api/team.routes';

app.use('/api/auth',        authRoutes);
app.use('/api/knowledge',   knowledgeRoutes);
app.use('/api/instructions', instructionsRoutes);
app.use('/api/assets',       assetsRoutes);
app.use('/api/orion-web',   chatRoutes);
app.use('/api/whatsapp',    whatsappRoutes);
app.use('/api/facebook',    facebookRoutes);
app.use('/api/instagram',   instagramRoutes);
app.use('/api/bookings',    bookingsRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/templates',   templatesRoutes);
app.use('/api/campaigns',   campaignsRoutes);
app.use('/api/billing',     billingRoutes);
app.use('/api/team',        teamRoutes);
app.use('/api',             coreRoutes);

// Frontend em Produção
const frontendPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Fatal Error:', err.message);
  res.status(500).json({ error: 'Erro interno no servidor' });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Orion Server na porta ${PORT} | IA: Gemini 2.5 Flash | Socket.io: Activo`);
  
  // Auto-recuperação de leads sem resposta nas últimas 24 horas devido ao erro anterior
  import('./api/whatsapp.routes').then(({ recoverMissedMessages }) => {
    setTimeout(() => {
      recoverMissedMessages().catch(err => console.error('[RECOVERY-BOOT] Falha na recuperação de boot:', err.message));
    }, 5000);
  }).catch(err => console.error('[RECOVERY-BOOT] Erro de importação no boot:', err.message));
});
