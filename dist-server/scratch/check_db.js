"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../config/supabase");
async function main() {
    console.log('Verificando colunas da tabela knowledge_docs...');
    const { data: kdData, error: kdError } = await supabase_1.supabaseAdmin
        .from('knowledge_docs')
        .select('*')
        .limit(1);
    if (kdError) {
        console.error('Erro ao ler knowledge_docs:', kdError.message);
    }
    else {
        console.log('Exemplo de linha de knowledge_docs:', kdData);
    }
    console.log('\nVerificando colunas da tabela team_members...');
    const { data: tmData, error: tmError } = await supabase_1.supabaseAdmin
        .from('team_members')
        .select('*')
        .limit(1);
    if (tmError) {
        console.error('Erro ao ler team_members:', tmError.message);
    }
    else {
        console.log('Exemplo de linha de team_members:', tmData);
    }
}
main().catch(console.error);
