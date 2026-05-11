import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// API Proxypay (Angola - Multicaixa Express)
const PROXYPAY_API_KEY = process.env.PROXYPAY_API_KEY || '';
const PROXYPAY_ENV = process.env.PROXYPAY_ENV || 'sandbox'; // 'sandbox' or 'production'
const PROXYPAY_BASE = PROXYPAY_ENV === 'production'
    ? 'https://api.proxypay.co.ao'
    : 'https://api.sandbox.proxypay.co.ao';

const PLAN_PRICES: Record<string, number> = {
    starter: 1500000,  // 15.000 Kz em centavos
    pro: 4500000,      // 45.000 Kz em centavos
};

const PLAN_LABELS: Record<string, string> = {
    starter: 'Plano Starter - 15.000 Kz/mês',
    pro: 'Plano Pro - 45.000 Kz/mês',
};

// GET /api/billing/status - Estado da subscrição atual
router.get('/status', requireAuth, async (req: AuthRequest, res) => {
    try {
        const orgId = req.user?.id;
        const email = req.user?.email;

        const { data: sub, error } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('org_id', orgId)
            .maybeSingle();

        if (error) throw error;

        if (!sub) {
            return res.json({ status: 'no_subscription', plan: 'none', daysLeft: 0 });
        }

        let daysLeft = 0;
        if (sub.plan === 'trial' && sub.trial_ends_at) {
            const now = new Date();
            const end = new Date(sub.trial_ends_at);
            daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        } else if (sub.plan_ends_at) {
            const now = new Date();
            const end = new Date(sub.plan_ends_at);
            daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        }

        res.json({
            status: sub.status,
            plan: sub.plan,
            daysLeft,
            trial_ends_at: sub.trial_ends_at,
            plan_ends_at: sub.plan_ends_at,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/billing/payment/create - Gerar referência Multicaixa
router.post('/payment/create', requireAuth, async (req: AuthRequest, res) => {
    try {
        const orgId = req.user?.id;
        const { plan } = req.body;

        if (!PLAN_PRICES[plan]) {
            return res.status(400).json({ error: 'Plano inválido. Escolha starter ou pro.' });
        }

        const amount = PLAN_PRICES[plan];
        const description = PLAN_LABELS[plan];

        // Chamar API da Proxypay para gerar referência
        let reference = '';
        let entity = '';
        let proxypayId = '';
        let expiresAt = '';

        if (PROXYPAY_API_KEY) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 3); // 3 dias de validade

            const proxypayRes = await fetch(`${PROXYPAY_BASE}/v2/references`, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${PROXYPAY_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: (amount / 100).toFixed(2),
                    end_datetime: expiryDate.toISOString().split('T')[0],
                    description,
                    custom_fields: { org_id: orgId, plan },
                })
            });

            if (proxypayRes.ok) {
                const proxypayData: any = await proxypayRes.json();
                reference = proxypayData.id;
                entity = proxypayData.entity || '00011';
                proxypayId = proxypayData.id;
                expiresAt = expiryDate.toISOString();
            } else {
                // Fallback para desenvolvimento sem API key
                reference = String(Math.floor(100000000 + Math.random() * 900000000));
                entity = '00011';
                expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
            }
        } else {
            // Modo demo sem Proxypay configurado
            reference = String(Math.floor(100000000 + Math.random() * 900000000));
            entity = '00011';
            expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        }

        // Salvar pagamento pendente no banco
        const { data: payment, error } = await supabaseAdmin
            .from('payments')
            .insert({
                org_id: orgId,
                reference,
                entity,
                amount,
                plan,
                status: 'pending',
                proxypay_id: proxypayId || null,
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            reference,
            entity,
            amount: amount / 100,
            description,
            expires_at: expiresAt,
            payment_id: payment.id,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/billing/webhook/proxypay - Webhook da Proxypay (pagamento confirmado)
router.post('/webhook/proxypay', async (req, res) => {
    try {
        const event = req.body;
        console.log('[PROXYPAY WEBHOOK]', JSON.stringify(event));

        if (event.type === 'payment' || event.status === 'paid') {
            const reference = event.id || event.reference;

            // Buscar o pagamento pendente
            const { data: payment } = await supabaseAdmin
                .from('payments')
                .select('*')
                .eq('reference', reference)
                .eq('status', 'pending')
                .maybeSingle();

            if (payment) {
                // Ativar plano
                const planEnd = new Date();
                planEnd.setDate(planEnd.getDate() + 30); // 30 dias

                await supabaseAdmin.from('payments').update({
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                }).eq('id', payment.id);

                await supabaseAdmin.from('subscriptions').upsert({
                    org_id: payment.org_id,
                    plan: payment.plan,
                    status: 'active',
                    plan_ends_at: planEnd.toISOString(),
                    trial_ends_at: null,
                }, { onConflict: 'org_id' });

                console.log(`[PROXYPAY] Plano ${payment.plan} ativado para org ${payment.org_id}`);
            }
        }

        res.sendStatus(200);
    } catch (err: any) {
        console.error('[PROXYPAY WEBHOOK ERROR]', err.message);
        res.sendStatus(500);
    }
});

// GET /api/billing/vips - Listar VIPs (Admin)
router.get('/vips', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('vips').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/billing/vips - Adicionar VIP
router.post('/vips', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { email, reason } = req.body;
        if (!email) return res.status(400).json({ error: 'Email é obrigatório.' });

        const { data, error } = await supabaseAdmin
            .from('vips')
            .upsert({ email: email.toLowerCase(), reason })
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'VIP adicionado com sucesso!', vip: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/billing/vips/:id - Remover VIP
router.delete('/vips/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabaseAdmin.from('vips').delete().eq('id', id);
        if (error) throw error;
        res.json({ message: 'VIP removido com sucesso.' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
