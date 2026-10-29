"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ai_service_1 = require("../services/ai.service");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const booking_service_1 = require("../services/booking.service");
const google_sheets_service_1 = require("../services/google_sheets.service");
const socket_1 = require("../socket");
const router = (0, express_1.Router)();
// ─── POST /api/orion-web/chat — Chat de suporte Orion (widget do site) ────────
router.post('/chat', async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Mensagem não pode estar vazia.' });
        }
        // Manter apenas as últimas 30 mensagens para o widget de suporte
        const contextHistory = (history || []).slice(-30);
        const result = await ai_service_1.AIService.generateResponse({
            message: message.trim(),
            history: contextHistory,
            orgId: 'orion_system',
            mode: 'support',
            botName: 'Orion Support',
        });
        res.json(result);
    }
    catch (err) {
        console.error('[CHAT ROUTE] Erro:', err.message);
        res.status(500).json({
            error: 'Erro temporário no serviço de suporte.',
            details: err.message,
        });
    }
});
// ─── POST /api/orion-web/start-conversation — Iniciar conversa com estrutura completa ─────
router.post('/start-conversation', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId || req.user?.id;
        if (!orgId) {
            return res.status(400).json({ error: 'Organização não identificada.' });
        }
        const { channel = 'whatsapp', name, phone, email, subject, message, hasBooking, appointmentDate, appointmentTime, } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
        }
        if (!phone || phone.replace(/\D/g, '').length < 6) {
            return res.status(400).json({ error: 'Número de telefone válido é obrigatório.' });
        }
        // Normalizar telefone para padrão internacional E.164
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('00'))
            cleanPhone = cleanPhone.substring(2);
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
            await supabase_1.supabaseAdmin.from('contacts').upsert({
                org_id: orgId,
                phone: cleanPhone,
                name: customerName,
                email: customerEmail,
                notes: customerSubject,
                source: selectedChannel,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'org_id, phone' });
        }
        catch (dbErr) {
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
        await supabase_1.supabaseAdmin
            .from('conversation_history')
            .insert(initialMsgPayload);
        // 3. Processar agendamento se requisitado
        let bookingResult = null;
        if (hasBooking && appointmentDate && appointmentTime) {
            bookingResult = await booking_service_1.BookingService.processBooking(orgId, {
                name: customerName,
                subject: customerSubject,
                phone: cleanPhone,
                email: customerEmail || undefined,
                date: appointmentDate,
                time: appointmentTime,
            }, { channelOrigin: `Live Chat (${selectedChannel.toUpperCase()})` });
            // Sincronizar agendamento no Google Sheets
            google_sheets_service_1.GoogleSheetsService.syncBooking({
                orgId,
                name: customerName,
                subject: customerSubject,
                phone: cleanPhone,
                email: customerEmail || '',
                date: appointmentDate,
                time: appointmentTime,
                channel: selectedChannel.toUpperCase(),
            }).catch(() => { });
        }
        // 4. Sincronizar interação com a planilha do Google
        google_sheets_service_1.GoogleSheetsService.syncInteraction({
            orgId,
            channel: selectedChannel,
            phoneOrId: cleanPhone,
            name: customerName,
            email: customerEmail || '',
            subject: customerSubject,
            text: initialText,
            status: hasBooking ? 'Agendado' : 'Ativo',
        }).catch(() => { });
        // 5. Emitir Socket.io para atualização em tempo real
        try {
            (0, socket_1.getIo)().to(`org:${orgId}`).emit('new_message', {
                phone: cleanPhone,
                sender: 'human',
                text: initialText,
                time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
                timestamp: new Date().toISOString(),
                platform: selectedChannel,
                customer_name: customerName,
                metadata: initialMsgPayload.metadata,
            });
        }
        catch (_) { }
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
    }
    catch (err) {
        console.error('[START-CONVERSATION] Erro ao iniciar conversa:', err.message);
        res.status(500).json({ error: 'Erro ao iniciar conversa', details: err.message });
    }
});
exports.default = router;
