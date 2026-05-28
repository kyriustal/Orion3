import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { EmailService } from '../services/email.service';

const router = Router();

// GET /api/team - Listar membros da equipa
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    
    const { data, error } = await supabaseAdmin
      .from('team_members')
      .select('id, name, email, role, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        // Tabela não existe ainda
        return res.json([]);
      }
      throw error;
    }
    
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/team - Adicionar membro à equipa
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    const { name, email, role, password } = req.body;

    // Verificar permissão
    if (req.user?.role !== 'OWNER' && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Sem permissão para adicionar membros' });
    }

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });
    }

    // Auto-healing: Garantir que a organização do utilizador existe
    const { data: orgCheck } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .maybeSingle();

    if (!orgCheck) {
      console.log(`[TEAM ROUTE] Auto-healing: Criando organização em falta para o utilizador ${orgId}`);
      await supabaseAdmin.from('organizations').insert({
        id: orgId,
        owner_email: req.user?.email || '',
        first_name: req.user?.email?.split('@')[0] || 'Admin',
        name: 'Minha Organização',
      });
    }

    // 1. Criar o utilizador no auth.users do Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role }
    });

    if (authError) {
      // Se o email já estiver em uso, tentar ver se já não é membro desta org
      if (authError.message.includes('already been registered')) {
        return res.status(400).json({ error: 'Este e-mail já tem conta registada no sistema.' });
      }
      throw authError;
    }

    const newUserId = authData.user.id;

    // 2. Inserir na tabela team_members
    const { data: newMember, error: dbError } = await supabaseAdmin
      .from('team_members')
      .insert({
        org_id: orgId,
        user_id: newUserId,
        name,
        email,
        role
      })
      .select('id, name, email, role, created_at')
      .single();

    if (dbError) throw dbError;

    // 3. Obter nome da organização e enviar email de convite com as credenciais configuradas
    try {
      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle();
      
      const orgName = orgData?.name || 'Orion';

      await EmailService.sendTeamInvitation({
        email,
        name,
        password,
        role,
        orgName
      });
    } catch (emailErr: any) {
      // Logamos o erro mas não impedimos a criação do membro (para robustez)
      console.error(`[TEAM ROUTE] Erro ao disparar email de convite para ${email}:`, emailErr.message);
    }

    res.status(201).json(newMember);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
