import { Router, Request, Response } from 'express';
import { AIService } from '../services/ai.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { BookingService } from '../services/booking.service';
import { GoogleSheetsService } from '../services/google_sheets.service';
import { getIo } from '../socket';

const router = Router();

// ─── POST /api/orion-web/chat — Chat de suporte Orion (widget do site) ────────
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Mensagem não pode estar vazia.' });
    }

    // Manter apenas as últimas 30 mensagens para o widget de suporte
    const contextHistory = (history || []).slice(-30);

    const result = await AIService.generateResponse({
      message: message.trim(),
      history: contextHistory,
      orgId: 'orion_system',
      mode: 'support',
      botName: 'Orion Support',
    });

    res.json(result);
  } catch (err: any) {
    console.error('[CHAT ROUTE] Erro:', err.message);
    res.status(500).json({
      error: 'Erro temporário no serviço de suporte.',
      details: err.message,
    });
  }
});

// ─── POST /api/orion-web/start-conversation — Iniciar conversa com estrutura completa ─────
router.post('/start-conversation', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organização não identificada.' });
    }

    const {
      channel = 'whatsapp',
      name,
      phone,
      email,
      subject,
      message,
      hasBooking,
      appointmentDate,
      appointmentTime,
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
    }

    if (!phone || phone.replace(/\D/g, '').length < 6) {
      return res.status(400).json({ error: 'Número de telefone válido é obrigatório.' });
    }

    // Normalizar telefone para padrão internacional E.164
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.substring(2);
    if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
      cleanPhone = `244${cleanPhone}`;
    }

    const customerName = name.trim();
    const customerEmail = email?.trim() || null;
    const customerSubject = subject?.trim() || 'Atendimento Geral';
    const initialText = message?.trim() || `[Início de Atendimento]: ${customerSubject}`;
    const selectedChannel = (channel || 'whatsapp').toLowerCase();

    // 1. Salvar ou atualizar na tabela contacts
    try {
      await supabaseAdmin.from('contacts').upsert({
        org_id: orgId,
        phone: cleanPhone,
        name: customerName,
        email: customerEmail,
        notes: customerSubject,
        source: selectedChannel,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id, phone' });
    } catch (dbErr: any) {
      console.warn('[START-CONVERSATION] Aviso ao salvar na tabela contacts:', dbErr.message);
    }

    // 2. Registrar mensagem inicial em conversation_history
    const initialMsgPayload = {
      org_id: orgId,
      customer_phone: cleanPhone,
      sender: 'human',
      text: initialText,
      metadata: {
        platform: selectedChannel,
        customer_name: customerName,
        subject: customerSubject,
        email: customerEmail || undefined,
        initiated_by_agent: true,
      },
    };

    await supabaseAdmin
      .from('conversation_history')
      .insert(initialMsgPayload);

    // 3. Processar agendamento se requisitado
    let bookingResult: any = null;
    if (hasBooking && appointmentDate && appointmentTime) {
      bookingResult = await BookingService.processBooking(orgId, {
        name: customerName,
        subject: customerSubject,
        phone: cleanPhone,
        email: customerEmail || undefined,
        date: appointmentDate,
        time: appointmentTime,
      }, { channelOrigin: `Live Chat (${selectedChannel.toUpperCase()})` });

      // Sincronizar agendamento no Google Sheets
      GoogleSheetsService.syncBooking({
        orgId,
        name: customerName,
        subject: customerSubject,
        phone: cleanPhone,
        email: customerEmail || '',
        date: appointmentDate,
        time: appointmentTime,
        channel: selectedChannel.toUpperCase(),
      }).catch(() => {});
    }

    // 4. Sincronizar interação com a planilha do Google
    GoogleSheetsService.syncInteraction({
      orgId,
      channel: selectedChannel as any,
      phoneOrId: cleanPhone,
      name: customerName,
      email: customerEmail || '',
      subject: customerSubject,
      text: initialText,
      status: hasBooking ? 'Agendado' : 'Ativo',
    }).catch(() => {});

    // 5. Emitir Socket.io para atualização em tempo real
    try {
      getIo().to(`org:${orgId}`).emit('new_message', {
        phone: cleanPhone,
        sender: 'human',
        text: initialText,
        time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        platform: selectedChannel,
        customer_name: customerName,
        metadata: initialMsgPayload.metadata,
      });
    } catch (_) {}

    res.json({
      success: true,
      message: 'Conversa iniciada com a estrutura completa e sincronizada!',
      chat: {
        id: cleanPhone,
        phone: cleanPhone,
        name: `${customerName} (${cleanPhone})`,
        lastMessage: initialText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        platform: selectedChannel,
        email: customerEmail || undefined,
        subject: customerSubject,
      },
      booking: bookingResult,
    });
  } catch (err: any) {
    console.error('[START-CONVERSATION] Erro ao iniciar conversa:', err.message);
    res.status(500).json({ error: 'Erro ao iniciar conversa', details: err.message });
  }
});

export default router;
