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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const report_service_1 = require("../services/report.service");
const google_sheets_service_1 = require("../services/google_sheets.service");
const supabase_1 = require("../config/supabase");
const router = (0, express_1.Router)();
// ─── GET /api/reports/daily — Obter dados consolidados do relatório ────────────
router.get('/daily', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId || req.user?.id;
        if (!orgId) {
            return res.status(400).json({ error: 'Organização não identificada.' });
        }
        const period = req.query.period || '24h';
        const channel = req.query.channel || 'all';
        const reportData = await report_service_1.ReportService.generateReportData({
            orgId,
            period,
            channel,
        });
        res.json(reportData);
    }
    catch (err) {
        console.error('[REPORTS API] Erro ao obter dados do relatório:', err.message);
        res.status(500).json({ error: 'Erro ao gerar dados do relatório', details: err.message });
    }
});
// ─── POST /api/reports/send-email — Disparar envio de email com PDF agora ─────
router.post('/send-email', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId || req.user?.id;
        if (!orgId) {
            return res.status(400).json({ error: 'Organização não identificada.' });
        }
        const { period = '24h' } = req.body;
        const result = await report_service_1.ReportService.sendDailyReportEmail(orgId, period);
        if (result.success) {
            res.json({
                message: 'Relatório enviado com sucesso para todos os e-mails da empresa e equipe!',
                recipients: result.recipients,
                whatsappBroadcastNumbersCount: result.numbersCount,
                bookingsCount: result.bookingsCount,
            });
        }
        else {
            res.status(400).json({
                error: result.error || 'Falha ao enviar relatório por e-mail.',
            });
        }
    }
    catch (err) {
        console.error('[REPORTS API] Erro ao enviar relatório por email:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// ─── GET /api/reports/export-pdf — Download / visualização executiva em PDF ────
router.get('/export-pdf', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId || req.user?.id;
        if (!orgId) {
            return res.status(400).send('Organização não identificada.');
        }
        const period = req.query.period || '24h';
        const reportData = await report_service_1.ReportService.generateReportData({ orgId, period });
        const { data: org } = await supabase_1.supabaseAdmin
            .from('organizations')
            .select('name')
            .eq('id', orgId)
            .maybeSingle();
        const orgName = org?.name || 'Orion Intelligence';
        const html = report_service_1.ReportService.buildExecutiveHtmlReport(reportData, orgName);
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `inline; filename="Relatorio_Orion_${period}.html"`);
        res.send(html);
    }
    catch (err) {
        res.status(500).send(`Erro ao gerar documento: ${err.message}`);
    }
});
// ─── GET /api/reports/google-sheet-url — Obter URL configurada ─────────────────
router.get('/google-sheet-url', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId || req.user?.id;
        const url = await google_sheets_service_1.GoogleSheetsService.getWebhookUrl(orgId);
        res.json({ webhookUrl: url || '' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── POST /api/reports/google-sheet-url — Salvar URL configurada ────────────────
router.post('/google-sheet-url', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId || req.user?.id;
        const { webhookUrl } = req.body;
        if (!webhookUrl || typeof webhookUrl !== 'string') {
            return res.status(400).json({ error: 'URL do Google Apps Script é obrigatória.' });
        }
        const saved = await google_sheets_service_1.GoogleSheetsService.setWebhookUrl(orgId, webhookUrl);
        res.json({ success: saved, message: 'URL do Google Apps Script salva com sucesso!' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── POST /api/reports/test-google-sheet — Testar conexão com a Planilha ────────
router.post('/test-google-sheet', auth_1.requireAuth, async (req, res) => {
    try {
        const { webhookUrl } = req.body;
        if (!webhookUrl) {
            return res.status(400).json({ error: 'URL do Webhook necessária para o teste.' });
        }
        const testRes = await google_sheets_service_1.GoogleSheetsService.testConnection(webhookUrl);
        if (testRes.success) {
            res.json(testRes);
        }
        else {
            res.status(400).json(testRes);
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── POST /api/reports/sync-google-sheet — Sincronizar todos os dados agora ─────
router.post('/sync-google-sheet', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId || req.user?.id;
        const webhookUrl = await google_sheets_service_1.GoogleSheetsService.getWebhookUrl(orgId);
        if (!webhookUrl) {
            return res.status(400).json({
                error: 'Nenhuma URL do Google Apps Script configurada. Cole a URL do Web App nas configurações.',
            });
        }
        // Buscar contactos e agendamentos para envio em batch
        const { data: contacts = [] } = await supabase_1.supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('org_id', orgId);
        const { data: bookings = [] } = await supabase_1.supabaseAdmin
            .from('bookings')
            .select('*')
            .eq('org_id', orgId);
        // Enviar batch para a planilha
        const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
        const batchRes = await axios.post(webhookUrl, {
            type: 'batch_sync',
            contacts: (contacts || []).map(c => ({
                channel: c.source || 'whatsapp',
                phone: c.phone,
                name: c.name,
                email: c.email,
                text: c.notes || 'Contacto sincronizado via Orion',
                status: 'Sincronizado',
            })),
            bookings: (bookings || []).map(b => ({
                name: [b.first_name, b.last_name].filter(Boolean).join(' '),
                phone: b.phone,
                email: b.email,
                subject: b.service,
                date: b.appointment_date,
                time: b.appointment_time,
                channel: 'Agendamento',
                status: 'Confirmado',
            })),
        }, { timeout: 15000 });
        res.json({
            message: 'Sincronização completa realizada com sucesso!',
            contactsSynced: (contacts || []).length,
            bookingsSynced: (bookings || []).length,
            details: batchRes.data,
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Erro na sincronização', details: err.message });
    }
});
exports.default = router;
