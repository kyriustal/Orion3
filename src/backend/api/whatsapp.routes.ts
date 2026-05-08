import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = Router();

// Diagnóstico de Tabela (Para saber se o SQL foi rodado)
router.get('/debug-table', requireAuth, async (req: any, res) => {
    try {
        const { data, error } = await supabase.from('whatsapp_config').select('count', { count: 'exact', head: true });
        if (error) throw error;
        res.json({ status: 'success', message: 'Tabela whatsapp_config existe e está acessível.' });
    } catch (err: any) {
        res.status(500).json({ status: 'error', message: 'Tabela whatsapp_config NÃO acessível.', details: err.message });
    }
});

// /api/whatsapp/config (POST) - Versão com Diagnóstico Pesado
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  console.log('[DEBUG-WA] Recebendo nova configuração...');
  try {
    const orgId = req.user?.id;
    if (!orgId) throw new Error('Usuário não autenticado no servidor.');

    const configData = { 
        ...req.body, 
        org_id: orgId,
        is_active: true 
    };

    console.log('[DEBUG-WA] Tentando UPSERT no Supabase para Org:', orgId);

    const { data, error } = await supabase
      .from('whatsapp_config')
      .upsert(configData, { onConflict: 'org_id' })
      .select()
      .single();

    if (error) {
        console.error('[DEBUG-WA] ERRO CRÍTICO NO SUPABASE:', error);
        return res.status(400).json({ 
            error: 'Erro no Banco de Dados', 
            details: error.message,
            hint: 'Verifique se você rodou o comando SQL no Supabase Editor.'
        });
    }

    console.log('[DEBUG-WA] Configuração salva com sucesso!');
    res.json({ message: 'Conectado!', data });

  } catch (error: any) {
    console.error('[DEBUG-WA] FALHA GERAL NA ROTA:', error.message);
    res.status(500).json({ error: 'Erro Interno', details: error.message });
  }
});

// Listar Config
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
    try {
      const orgId = req.user?.id;
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();
  
      if (error) throw error;
      res.json(data || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

export default router;
