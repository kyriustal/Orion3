"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const http_1 = require("http");
const socket_1 = require("./socket");
const auth_routes_1 = __importDefault(require("./api/auth.routes"));
const knowledge_routes_1 = __importDefault(require("./api/knowledge.routes"));
const chat_routes_1 = __importDefault(require("./api/chat.routes"));
const core_routes_1 = __importDefault(require("./api/core.routes"));
const whatsapp_routes_1 = __importDefault(require("./api/whatsapp.routes"));
const facebook_routes_1 = __importDefault(require("./api/facebook.routes"));
const instagram_routes_1 = __importDefault(require("./api/instagram.routes"));
const bookings_routes_1 = __importDefault(require("./api/bookings.routes"));
const automations_routes_1 = __importDefault(require("./api/automations.routes"));
const templates_routes_1 = __importDefault(require("./api/templates.routes"));
const campaigns_routes_1 = __importDefault(require("./api/campaigns.routes"));
const billing_routes_1 = __importDefault(require("./api/billing.routes"));
const instructions_routes_1 = __importDefault(require("./api/instructions.routes"));
const assets_routes_1 = __importDefault(require("./api/assets.routes"));
const followup_routes_1 = __importDefault(require("./api/followup.routes"));
const team_routes_1 = __importDefault(require("./api/team.routes"));
const push_routes_1 = __importDefault(require("./api/push.routes"));
const calendar_routes_1 = __importDefault(require("./api/calendar.routes"));
const business_hours_routes_1 = __importDefault(require("./api/business_hours.routes"));
const reports_routes_1 = __importDefault(require("./api/reports.routes"));
const tiktok_routes_1 = __importDefault(require("./api/tiktok.routes"));
const email_inbox_routes_1 = __importDefault(require("./api/email_inbox.routes"));
console.log(`[BOOT] Carregando .env de: ${path_1.default.join(process.cwd(), '.env')}`);
// Inicialização
const app = (0, express_1.default)();
app.set('trust proxy', true);
const httpServer = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 3000;
// Cabeçalhos de Segurança Globais
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
});
// Inicializar Socket.io (singleton disponível globalmente via getIo())
(0, socket_1.initSocket)(httpServer);
// Middleware Global
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Health Check
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        server: 'Orion Backend',
        version: '3.0.0',
        ai_text: 'DeepSeek (Principal)',
        ai_multimodal: 'Gemini 2.5 Flash (Multimodal)',
    });
});
// ─── Rotas ────────────────────────────────────────────────────────────────────
app.use('/api/auth', auth_routes_1.default);
app.use('/api/knowledge', knowledge_routes_1.default);
app.use('/api/instructions', instructions_routes_1.default);
app.use('/api/assets', assets_routes_1.default);
app.use('/api/orion-web', chat_routes_1.default);
app.use('/api/whatsapp', whatsapp_routes_1.default);
app.use('/api/webhook', (req, res, next) => {
    if (req.url === '/')
        req.url = '/webhook';
    else if (req.url.startsWith('/?'))
        req.url = `/webhook${req.url.slice(1)}`;
    else
        req.url = `/webhook${req.url}`;
    (0, whatsapp_routes_1.default)(req, res, next);
});
app.use('/api/facebook', facebook_routes_1.default);
app.use('/api/instagram', instagram_routes_1.default);
app.use('/api/tiktok', tiktok_routes_1.default);
app.use('/api/email-inbox', email_inbox_routes_1.default);
app.use('/api/bookings', bookings_routes_1.default);
app.use('/api/automations', automations_routes_1.default);
app.use('/api/templates', templates_routes_1.default);
app.use('/api/campaigns', campaigns_routes_1.default);
app.use('/api/billing', billing_routes_1.default);
app.use('/api/team', team_routes_1.default);
app.use('/api/push', push_routes_1.default);
app.use('/api/settings/calendar', calendar_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api', business_hours_routes_1.default);
app.use('/api', followup_routes_1.default);
app.use('/api', core_routes_1.default);
// Frontend em Produção
const frontendPath = path_1.default.join(__dirname, '..', 'dist');
app.use(express_1.default.static(frontendPath));
app.get('*', (_req, res) => {
    res.sendFile(path_1.default.join(frontendPath, 'index.html'));
});
// Error Handler
app.use((err, _req, res, _next) => {
    console.error('Fatal Error:', err.message);
    res.status(500).json({ error: 'Erro interno no servidor' });
});
httpServer.listen(PORT, () => {
    console.log(`🚀 Orion Server na porta ${PORT} | IA Texto: DeepSeek (Principal) | IA Multimodal: Gemini 2.5 Flash | Socket.io: Activo`);
    // Auto-recuperação de leads sem resposta nas últimas 24 horas
    Promise.resolve().then(() => __importStar(require('./api/whatsapp.routes'))).then(({ recoverMissedMessages }) => {
        setTimeout(() => {
            recoverMissedMessages().catch(err => console.error('[RECOVERY-BOOT] Falha na recuperação de boot:', err.message));
        }, 5000);
    }).catch(err => console.error('[RECOVERY-BOOT] Erro de importação no boot:', err.message));
    // Iniciar worker de follow-up / remarketing autónomo
    Promise.resolve().then(() => __importStar(require('./workers/followup.worker'))).catch(err => console.error('[FOLLOWUP-BOOT] Erro ao iniciar worker:', err.message));
    // Iniciar worker de lembretes e alertas automáticos de agendamentos (4 estágios)
    Promise.resolve().then(() => __importStar(require('./workers/reminder.worker'))).catch(err => console.error('[REMINDER-BOOT] Erro ao iniciar worker de lembretes:', err.message));
    // Iniciar worker de relatório diário às 23:59 (WAT / Horário de Angola)
    Promise.resolve().then(() => __importStar(require('./workers/daily_report.worker'))).catch(err => console.error('[DAILY-REPORT-BOOT] Erro ao iniciar worker de relatório diário:', err.message));
    // Iniciar worker de comentários multicanal (Facebook, Instagram, TikTok)
    Promise.resolve().then(() => __importStar(require('./workers/comments.worker'))).catch(err => console.error('[COMMENTS-WORKER-BOOT] Erro ao iniciar worker de comentários:', err.message));
    // Iniciar worker de respostas automáticas de e-mail (IMAP / SMTP)
    Promise.resolve().then(() => __importStar(require('./workers/email_inbox.worker'))).catch(err => console.error('[EMAIL-INBOX-BOOT] Erro ao iniciar worker de e-mails:', err.message));
    // Iniciar worker de agendamento de campanhas em massa (SCHEDULED)
    Promise.resolve().then(() => __importStar(require('./workers/campaign_scheduler.worker'))).catch(err => console.error('[CAMPAIGN-SCHEDULER-BOOT] Erro ao iniciar worker de agendamento de campanhas:', err.message));
});
