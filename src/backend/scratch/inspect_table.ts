import { supabaseAdmin } from '../config/supabase';

async function main() {
  console.log('--- INSPEÇÃO DE TABELA: team_members ---');
  
  // Tentar fazer um reload do cache do PostgREST enviando um comando NOTIFY (através de uma query ou simplesmente fazendo uma chamada que provoque a leitura)
  console.log('Recarregando schema cache via requisição...');
  
  // Vamos ler a lista de tabelas/colunas disponíveis no PostgREST se possível, ou simplesmente ler um registo
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Erro ao ler team_members:', error);
  } else {
    console.log('Leitura bem-sucedida! Dados:', data);
  }

  // Vamos tentar verificar se conseguimos rodar uma query direta para ver as colunas usando a API REST
  // Supabase REST API fornece informações de OpenAPI / Swagger no endpoint raiz `/rest/v1/`
  console.log('Fim do teste.');
}

main().catch(console.error);
