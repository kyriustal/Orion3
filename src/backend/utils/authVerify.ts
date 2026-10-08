import { supabase, supabaseAdmin } from '../config/supabase';

/**
 * Valida a palavra-passe de acesso do utilizador autenticado contra o Supabase Auth.
 * Utilizado para autorizar operações sensíveis de alteração de credenciais e integrações.
 */
export async function verifyUserPassword(
  userId?: string,
  userEmail?: string,
  password?: string
): Promise<{ valid: boolean; error?: string }> {
  if (!password || !password.trim()) {
    return {
      valid: false,
      error: 'Palavra-passe de acesso é obrigatória para autorizar a alteração de credenciais.',
    };
  }

  let email = userEmail;
  if (!email && userId) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      email = data?.user?.email;
    } catch (err: any) {
      console.warn('[AUTH-VERIFY] Falha ao recuperar e-mail do utilizador:', err.message);
    }
  }

  if (!email) {
    return {
      valid: false,
      error: 'Sessão inválida: não foi possível identificar o e-mail do utilizador.',
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: password.trim(),
    });

    if (error || !data?.user) {
      return {
        valid: false,
        error: 'Palavra-passe incorreta. Acesso negado para editar as credenciais.',
      };
    }

    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || 'Erro inesperado ao validar a palavra-passe.',
    };
  }
}
