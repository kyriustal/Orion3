"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const email_service_1 = require("../services/email.service");
const router = (0, express_1.Router)();
// GET /api/team - Listar membros da equipa
router.get('/', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { data, error } = await supabase_1.supabaseAdmin
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/team - Adicionar membro à equipa
router.post('/', auth_1.requireAuth, async (req, res) => {
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
        const { data: orgCheck } = await supabase_1.supabaseAdmin
            .from('organizations')
            .select('id')
            .eq('id', orgId)
            .maybeSingle();
        if (!orgCheck) {
            console.log(`[TEAM ROUTE] Auto-healing: Criando organização em falta para o utilizador ${orgId}`);
            await supabase_1.supabaseAdmin.from('organizations').insert({
                id: orgId,
                owner_email: req.user?.email || '',
                first_name: req.user?.email?.split('@')[0] || 'Admin',
                name: 'Minha Organização',
            });
        }
        // 1. Criar o utilizador no auth.users do Supabase
        let newUserId;
        const { data: authData, error: authError } = await supabase_1.supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name, role }
        });
        if (authError) {
            if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
                console.log(`[TEAM ROUTE] Utilizador ${email} já existe no auth.users. Recuperando ID...`);
                const { data: usersList, error: listError } = await supabase_1.supabaseAdmin.auth.admin.listUsers();
                if (listError)
                    throw listError;
                const users = usersList?.users || [];
                const existingUser = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
                if (!existingUser) {
                    return res.status(400).json({ error: 'Este e-mail já está registado no sistema, mas não conseguimos recuperar o ID da conta.' });
                }
                newUserId = existingUser.id;
            }
            else {
                throw authError;
            }
        }
        else {
            newUserId = authData.user.id;
        }
        // 2. Inserir na tabela team_members
        const { data: newMember, error: dbError } = await supabase_1.supabaseAdmin
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
        if (dbError)
            throw dbError;
        // 3. Obter nome da organização e enviar email de convite com as credenciais configuradas
        try {
            const { data: orgData } = await supabase_1.supabaseAdmin
                .from('organizations')
                .select('name')
                .eq('id', orgId)
                .maybeSingle();
            const orgName = orgData?.name || 'Orion';
            await email_service_1.EmailService.sendTeamInvitation({
                email,
                name,
                password,
                role,
                orgName
            });
        }
        catch (emailErr) {
            // Logamos o erro mas não impedimos a criação do membro (para robustez)
            console.error(`[TEAM ROUTE] Erro ao disparar email de convite para ${email}:`, emailErr.message);
        }
        res.status(201).json(newMember);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/team/:id - Editar membro da equipa (função, palavra-passe, nome)
router.put('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { id } = req.params;
        const { name, role, password } = req.body;
        // Verificar permissão
        if (req.user?.role !== 'OWNER' && req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Sem permissão para editar membros' });
        }
        // Buscar o membro na base de dados
        const { data: member, error: findError } = await supabase_1.supabaseAdmin
            .from('team_members')
            .select('*')
            .eq('id', id)
            .eq('org_id', orgId)
            .maybeSingle();
        if (findError)
            throw findError;
        if (!member) {
            return res.status(404).json({ error: 'Membro da equipa não encontrado' });
        }
        // Validações adicionais de segurança
        // 1. Um ADMIN não pode alterar OWNER
        if (req.user?.role === 'ADMIN' && member.role === 'OWNER') {
            return res.status(403).json({ error: 'Um Administrador não pode alterar os dados do Proprietário da organização.' });
        }
        // 2. Não permitir que o utilizador altere a sua própria função
        if (member.user_id === req.user?.id && role && role !== member.role) {
            return res.status(400).json({ error: 'Não pode alterar a sua própria função de acesso.' });
        }
        // Atualizar no auth.users do Supabase se necessário
        const updateAuthData = {};
        if (password) {
            updateAuthData.password = password;
        }
        // Atualizar metadata no auth
        const userMetadata = {};
        if (name)
            userMetadata.name = name;
        if (role)
            userMetadata.role = role;
        if (Object.keys(userMetadata).length > 0) {
            updateAuthData.user_metadata = {
                name: name || member.name,
                role: role || member.role
            };
        }
        if (Object.keys(updateAuthData).length > 0) {
            const { error: authError } = await supabase_1.supabaseAdmin.auth.admin.updateUserById(member.user_id, updateAuthData);
            if (authError)
                throw authError;
        }
        // Atualizar na tabela team_members
        const updateDbData = {};
        if (name)
            updateDbData.name = name;
        if (role)
            updateDbData.role = role;
        const { data: updatedMember, error: dbError } = await supabase_1.supabaseAdmin
            .from('team_members')
            .update(updateDbData)
            .eq('id', id)
            .select('id, name, email, role, created_at')
            .single();
        if (dbError)
            throw dbError;
        res.json(updatedMember);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/team/:id - Excluir membro da equipa
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { id } = req.params;
        // Verificar permissão
        if (req.user?.role !== 'OWNER' && req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Sem permissão para remover membros' });
        }
        // Buscar o membro na base de dados
        const { data: member, error: findError } = await supabase_1.supabaseAdmin
            .from('team_members')
            .select('*')
            .eq('id', id)
            .eq('org_id', orgId)
            .maybeSingle();
        if (findError)
            throw findError;
        if (!member) {
            return res.status(404).json({ error: 'Membro da equipa não encontrado' });
        }
        // Validações de segurança
        // 1. Não permitir a auto-exclusão
        if (member.user_id === req.user?.id) {
            return res.status(400).json({ error: 'Não pode excluir a si mesmo da equipa.' });
        }
        // 2. Um ADMIN não pode excluir um OWNER
        if (req.user?.role === 'ADMIN' && member.role === 'OWNER') {
            return res.status(403).json({ error: 'Um Administrador não pode remover o Proprietário da organização.' });
        }
        // Excluir utilizador da autenticação do Supabase
        const { error: authError } = await supabase_1.supabaseAdmin.auth.admin.deleteUser(member.user_id);
        if (authError) {
            console.warn(`[TEAM ROUTE] Erro ao deletar no auth.users:`, authError.message);
        }
        // Deletar da tabela team_members explicitamente
        const { error: dbError } = await supabase_1.supabaseAdmin
            .from('team_members')
            .delete()
            .eq('id', id);
        if (dbError)
            throw dbError;
        res.json({ message: 'Membro da equipa removido com sucesso.' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
