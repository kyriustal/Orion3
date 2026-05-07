import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { AIService } from '../services/ai.service';

const router = Router();

/**
 * Utilitário para buscar dados do Supabase com tratamento de erro limpo
 */
async function fetchFromTable(tableName: string, orgId: string, res: Response) {
    try {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('org_id', orgId);

        if (error) throw error;
        res.json({ data: data || [] });
    } catch (err: any) {
        console.error(`Erro ao buscar em ${tableName}:`, err.message);
        res.json({ data: [], error: err.message }); // Retorna array vazio para não quebrar o front
    }
}

// Configurações da Organização
router.get('/settings/org', requireAuth, (req: AuthRequest, res: Response) => {
    const orgId = req.user?.id || 'default';
    fetchFromTable('organizations', orgId, res);
});

// Templates e Campanhas
router.get('/templates', requireAuth, (req: AuthRequest, res: Response) => {
    fetchFromTable('templates', req.user?.id || 'default', res);
});

// Equipe
router.get('/team', requireAuth, (req: AuthRequest, res: Response) => {
    fetchFromTable('team_members', req.user?.id || 'default', res);
});

// Automações
router.get('/automations', requireAuth, (req: AuthRequest, res: Response) => {
    fetchFromTable('automations', req.user?.id || 'default', res);
});

// SIMULAÇÃO DE AGENTE (Cérebro da IA)
router.post('/agent/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { message, botName, history } = req.body;
        const orgId = req.user?.id || 'default';

        const result = await AIService.generateResponse({
            message,
            botName,
            orgId,
            history: history || []
        });

        res.json(result);
    } catch (error: any) {
        console.error('Erro na Simulação:', error.message);
        res.status(500).json({ error: "Erro interno na simulação." });
    }
});

export default router;
