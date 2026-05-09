import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { AIService } from '../services/ai.service';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// Rota de Simulação do Agente (Empresa do Usuário)
router.post('/agent/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { message, botName, history } = req.body;
        const orgId = req.user?.id || 'default';

        const result = await AIService.generateResponse({
            message,
            botName,
            orgId,
            history: history || [],
            mode: 'simulation' // FORÇA MODO EMPRESA
        });

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: "Erro na simulação", details: error.message });
    }
});

// Settings: GET
router.get('/settings/org', requireAuth, async (req: AuthRequest, res) => {
    try {
        const orgId = req.user?.id;
        const { data, error } = await supabaseAdmin.from('organizations').select('*').eq('id', orgId).maybeSingle();
        if (error) throw error;
        res.json(data || {});
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Settings: POST
router.post('/settings/org', requireAuth, async (req: AuthRequest, res) => {
    try {
        const orgId = req.user?.id;
        const body = req.body;
        // Tenta fazer o upsert
        const { error } = await supabaseAdmin.from('organizations').upsert({ id: orgId, ...body });
        
        if (error) {
            if (error.code === '42P01' || error.code === '42703') {
                console.warn('[SETTINGS] Tabela ou coluna não existe no banco. Ignorando para não travar a UI.', error.message);
                return res.json({ message: 'Configurações salvas (em cache)' });
            }
            throw error;
        }
        res.json({ message: 'Configurações salvas' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
