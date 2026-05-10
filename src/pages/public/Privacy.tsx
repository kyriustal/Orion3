import { Shield, Bot } from "lucide-react";

export default function Privacy() {
    return (
        <div className="max-w-4xl mx-auto px-6 pt-20 pb-32">
            <div className="flex items-center gap-4 mb-16">
                <Shield className="w-10 h-10 text-emerald-600" />
                <h1 className="text-4xl font-bold">Política de Privacidade</h1>
            </div>

            <div className="prose prose-zinc max-w-none text-zinc-600">
                <p className="text-sm uppercase tracking-widest font-bold mb-8 text-zinc-400">Última atualização: Maio 2026</p>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">1. Compromisso com a Privacidade</h3>
                <p>Na Orion, a privacidade dos seus dados e dos dados dos seus clientes finais é nossa prioridade absoluta. Esta política detalha como lidamos com as informações processadas por nossos agentes de IA e integrações com a Meta Cloud API.</p>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">2. Coleta e Processamento de Dados</h3>
                <p>Para o funcionamento da plataforma, processamos os seguintes dados:</p>
                <ul className="list-disc pl-5 space-y-2 mt-4">
                    <li><strong>Dados da Conta:</strong> Nome, e-mail e informações de faturamento para gestão da sua assinatura.</li>
                    <li><strong>Mensagens de WhatsApp:</strong> Conteúdo das conversas enviadas para o seu número conectado, para que a IA possa processar e responder.</li>
                    <li><strong>Documentos da Base de Conhecimento:</strong> Arquivos que você sobe para treinar sua IA. Estes são encriptados e usados apenas para gerar respostas para a sua organização (org_id).</li>
                </ul>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">3. Compartilhamento com Terceiros</h3>
                <p>Nós NÃO vendemos seus dados. O compartilhamento ocorre apenas com:</p>
                <ul className="list-disc pl-5 space-y-2 mt-4">
                    <li><strong>Meta Inc:</strong> Para viabilizar o envio e recebimento de mensagens via API Cloud Oficial.</li>
                    <li><strong>Google Cloud (Gemini):</strong> Para o processamento da inteligência artificial através de conexões seguras e privadas.</li>
                    <li><strong>Supabase:</strong> Nossa infraestrutura de banco de dados encriptada.</li>
                </ul>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">4. Segurança dos Dados</h3>
                <p>Utilizamos protocolos de segurança de nível bancário para proteger sua Base de Conhecimento. Todas as comunicações entre o WhatsApp, nosso servidor e a IA são feitas via túneis HTTPS/TLS encriptados.</p>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">5. Conformidade com a LGPD</h3>
                <p>Respeitamos integralmente a Lei Geral de Proteção de Dados (LGPD). O usuário titular da conta Orion tem o direito de solicitar a exclusão total de seus dados e histórico de mensagens a qualquer momento através das configurações do painel.</p>
            </div>
        </div>
    );
}
