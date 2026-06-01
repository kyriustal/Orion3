import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { supabase, supabaseAdmin } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'orion-fallback-secret-key';

// Contas VIP permanentes (nunca expiram)
const VIP_EMAILS = [
    'natalj824@gmail.com',
    'cyroficial@gmail.com',
    'onvisaexpress@gmail.com',
    'cyrusnatalj@gmail.com',
    'kyriusnatal@gmail.com',
];

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e password são obrigatórios' });
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

        if (authError) {
            return res.status(401).json({ error: authError.message });
        }

        const user = authData.user;

        let orgId = user.id;
        let role = 'OWNER';
        let displayName = '';

        // Check if user is an owner
        const { data: org } = await supabaseAdmin.from('organizations').select('id, first_name').eq('id', user.id).maybeSingle();

        if (org) {
            displayName = org.first_name || '';
        } else {
            // Check if user is a team member
            const { data: member } = await supabaseAdmin.from('team_members').select('org_id, role, name').eq('user_id', user.id).maybeSingle();
            if (member) {
                orgId = member.org_id;
                role = member.role;
                displayName = member.name || '';
            } else {
                // Auto-healing: Se for o proprietário principal mas a linha na tabela 'organizations' não existir (dados legados/incompletos)
                console.log(`[AUTH LOGIN] Auto-healing: Criando organização em falta para o utilizador ${user.id}`);
                const ownerName = user.user_metadata?.first_name || email.split('@')[0];
                await supabaseAdmin.from('organizations').insert({
                    id: user.id,
                    owner_email: email,
                    first_name: ownerName,
                    name: 'Minha Organização',
                });
                orgId = user.id;
                role = 'OWNER';
                displayName = ownerName;
            }
        }

        if (!displayName) {
            displayName = user.user_metadata?.first_name || user.user_metadata?.name || email.split('@')[0] || 'Agente';
        }

        // Verificar subscrição (exceto VIPs)
        let subscriptionStatus = 'active';
        let subscriptionPlan = 'vip';
        let daysLeft = 9999;

        if (!VIP_EMAILS.includes(email.toLowerCase())) {
            const { data: sub } = await supabaseAdmin
                .from('subscriptions')
                .select('*')
                .eq('org_id', orgId)
                .maybeSingle();

            if (sub) {
                subscriptionStatus = sub.status;
                subscriptionPlan = sub.plan;

                // Verificar se trial expirou
                if (sub.plan === 'trial' && sub.trial_ends_at) {
                    const now = new Date();
                    const end = new Date(sub.trial_ends_at);
                    daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

                    if (daysLeft === 0 && sub.status === 'active') {
                        // Marcar como expirado
                        await supabaseAdmin.from('subscriptions').update({ status: 'expired' }).eq('org_id', user.id);
                        subscriptionStatus = 'expired';
                    }
                }
            }
        }

        const token = jwt.sign(
            {
                id: user.id,
                orgId: orgId,
                email: user.email,
                role: role,
                name: displayName,
                subscription: { status: subscriptionStatus, plan: subscriptionPlan }
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login realizado com sucesso',
            token,
            user: { id: user.id, orgId: orgId, email: user.email, role: role, name: displayName },
            subscription: { status: subscriptionStatus, plan: subscriptionPlan, daysLeft },
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Erro no servidor', details: error.message });
    }
});

// Register - com trial de 7 dias e deteção anti-fraude
router.post('/register', async (req, res) => {
    try {
        const {
            email, password,
            firstName, companyName, phone, whatsapp
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e password são obrigatórios' });
        }

        const isVip = VIP_EMAILS.includes(email.toLowerCase());

        // === DETEÇÃO ANTI-FRAUDE ===
        // Só verifica se não for VIP e se tiver dados de empresa
        if (!isVip && (companyName || phone || whatsapp)) {
            const fraudChecks: any[] = [];

            if (companyName) fraudChecks.push({ column: 'name', value: companyName });
            if (phone) fraudChecks.push({ column: 'phone', value: phone });
            if (whatsapp) fraudChecks.push({ column: 'whatsapp', value: whatsapp });

            for (const check of fraudChecks) {
                const { data: existingOrg } = await supabaseAdmin
                    .from('organizations')
                    .select('id, name')
                    .ilike(check.column, `%${check.value}%`)
                    .maybeSingle();

                if (existingOrg) {
                    // Verificar se essa org já tem trial expirado ou dívida
                    const { data: existingSub } = await supabaseAdmin
                        .from('subscriptions')
                        .select('status, plan')
                        .eq('org_id', existingOrg.id)
                        .maybeSingle();

                    if (existingSub && ['expired', 'debt'].includes(existingSub.status)) {
                        // Registar tentativa de fraude mesmo assim
                        const { data: authData } = await supabase.auth.signUp({ email, password });

                        if (authData?.user) {
                            // Criar subscrição marcada como dívida
                            await supabaseAdmin.from('subscriptions').insert({
                                org_id: authData.user.id,
                                email: email.toLowerCase(),
                                plan: 'none',
                                status: 'debt',
                                trial_ends_at: null,
                            });

                            // Registar na tabela de fraudes
                            await supabaseAdmin.from('fraud_flags').insert({
                                new_org_id: authData.user.id,
                                new_email: email,
                                matched_org_id: existingOrg.id,
                                matched_field: check.column,
                                matched_value: check.value,
                            });
                        }

                        return res.status(402).json({
                            error: 'Conta em Dívida',
                            details: 'Identificámos que a sua empresa já utilizou o período experimental gratuito nesta plataforma. Por favor, efectue o pagamento de um plano para continuar.',
                            code: 'DEBT_DETECTED',
                        });
                    }
                }
            }
        }

        // === REGISTO NORMAL ===
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { first_name: firstName, company_name: companyName } }
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
        }

        const user = authData.user;
        if (!user) {
            return res.status(400).json({ error: 'Erro ao criar utilizador' });
        }

        // Criar subscrição
        if (isVip) {
            await supabaseAdmin.from('subscriptions').insert({
                org_id: user.id,
                email: email.toLowerCase(),
                plan: 'enterprise',
                status: 'active',
                trial_ends_at: null,
                plan_ends_at: null, // VIPs não expiram
            });
        } else {
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 7); // 7 dias de trial

            await supabaseAdmin.from('subscriptions').insert({
                org_id: user.id,
                email: email.toLowerCase(),
                plan: 'trial',
                status: 'active',
                trial_ends_at: trialEnd.toISOString(),
            });
        }

        // Criar organização base (Sempre criada para garantir que o utilizador tem uma org associada)
        await supabaseAdmin.from('organizations').upsert({
            id: user.id,
            owner_email: email,
            first_name: firstName || '',
            name: companyName || `${firstName || 'Minha'} Empresa`,
            phone: phone || '',
            whatsapp: whatsapp || '',
        });

        res.status(201).json({
            message: isVip
                ? 'Conta criada com sucesso! Bem-vindo à equipa Orion.'
                : 'Conta criada! O seu período experimental de 7 dias começou agora.',
            user: { id: user.id, email: user.email },
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Erro no servidor', details: error.message });
    }
});

// Me
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
    try {
        res.json({ user: req.user });
    } catch (error: any) {
        res.status(500).json({ error: 'Erro no servidor', details: error.message });
    }
});

export default router;
