import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ReportService } from '../services/report.service';
import { GoogleSheetsService } from '../services/google_sheets.service';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// ─── GET /api/reports/daily — Obter dados consolidados do relatório ────────────
router.get('/daily', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organização não identificada.' });
    }

    const period = (req.query.period as any) || '24h';
    const channel = (req.query.channel as any) || 'all';

    const reportData = await ReportService.generateReportData({
      orgId,
      period,
      channel,
    });

    res.json(reportData);
  } catch (err: any) {
    console.error('[REPORTS API] Erro ao obter dados do relatório:', err.message);
    res.status(500).json({ error: 'Erro ao gerar dados do relatório', details: err.message });
  }
});

// ─── POST /api/reports/send-email — Disparar envio de email com PDF agora ─────
router.post('/send-email', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organização não identificada.' });
    }

    const { period = '24h' } = req.body;
    const result = await ReportService.sendDailyReportEmail(orgId, period);

    if (result.success) {
      res.json({
        message: 'Relatório enviado com sucesso para todos os e-mails da empresa e equipe!',
        recipients: result.recipients,
        whatsappBroadcastNumbersCount: result.numbersCount,
        bookingsCount: result.bookingsCount,
      });
    } else {
      res.status(400).json({
        error: result.error || 'Falha ao enviar relatório por e-mail.',
      });
    }
  } catch (err: any) {
    console.error('[REPORTS API] Erro ao enviar relatório por email:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/reports/export-pdf — Download / visualização executiva em PDF ────
router.get('/export-pdf', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) {
      return res.status(400).send('Organização não identificada.');
    }

    const period = (req.query.period as any) || '24h';
    const reportData = await ReportService.generateReportData({ orgId, period });

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle();

    const orgName = org?.name || 'Orion Intelligence';
    const html = ReportService.buildExecutiveHtmlReport(reportData, orgName);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="Relatorio_Orion_${period}.html"`);
    res.send(html);
  } catch (err: any) {
    res.status(500).send(`Erro ao gerar documento: ${err.message}`);
  }
});

// ─── GET /api/reports/google-sheet-url — Obter URL configurada ─────────────────
router.get('/google-sheet-url', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const url = await GoogleSheetsService.getWebhookUrl(orgId);
    res.json({ webhookUrl: url || '' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/reports/google-sheet-url — Salvar URL configurada ────────────────
router.post('/google-sheet-url', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const { webhookUrl } = req.body;

    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return res.status(400).json({ error: 'URL do Google Apps Script é obrigatória.' });
    }

    const saved = await GoogleSheetsService.setWebhookUrl(orgId!, webhookUrl);
    res.json({ success: saved, message: 'URL do Google Apps Script salva com sucesso!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/reports/test-google-sheet — Testar conexão com a Planilha ────────
router.post('/test-google-sheet', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl) {
      return res.status(400).json({ error: 'URL do Webhook necessária para o teste.' });
    }

    const testRes = await GoogleSheetsService.testConnection(webhookUrl);
    if (testRes.success) {
      res.json(testRes);
    } else {
      res.status(400).json(testRes);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/reports/sync-google-sheet — Sincronizar todos os dados agora ─────
router.post('/sync-google-sheet', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const webhookUrl = await GoogleSheetsService.getWebhookUrl(orgId);

    if (!webhookUrl) {
      return res.status(400).json({
        error: 'Nenhuma URL do Google Apps Script configurada. Cole a URL do Web App nas configurações.',
      });
    }

    // Buscar contactos e agendamentos para envio em batch
    const { data: contacts = [] } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('org_id', orgId);

    const { data: bookings = [] } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('org_id', orgId);

    // Enviar batch para a planilha
    const axios = (await import('axios')).default;
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
  } catch (err: any) {
    res.status(500).json({ error: 'Erro na sincronização', details: err.message });
  }
});

export default router;
