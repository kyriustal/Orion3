import express from 'express';
import cors from 'cors';
import path from 'path';

// Inicialização do App
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Global
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'Orion Backend', version: '2.0.0' });
});

// Importação das Rotas
import authRoutes from './api/auth.routes';
import knowledgeRoutes from './api/knowledge.routes';
import chatRoutes from './api/chat.routes';
import coreRoutes from './api/core.routes';
import whatsappRoutes from './api/whatsapp.routes';
import bookingsRoutes from './api/bookings.routes';
import automationsRoutes from './api/automations.routes';
import templatesRoutes from './api/templates.routes';
import campaignsRoutes from './api/campaigns.routes';
import billingRoutes from './api/billing.routes';

// Registro das Rotas
app.use('/api/auth', authRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/orion-web', chatRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api', coreRoutes);

// Frontend em Produção
const frontendPath = path.join(__dirname, '..', 'dist');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error Handler Final
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Fatal Error:', err.message);
    res.status(500).json({ error: 'Erro interno no servidor' });
});

// Start
app.listen(PORT, () => {
    console.log(`🚀 Orion Server pronto na porta ${PORT}`);
});
