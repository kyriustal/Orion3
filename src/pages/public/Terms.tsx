import { FileText, Bot } from "lucide-react";

export default function Terms() {
    return (
        <div className="max-w-4xl mx-auto px-6 pt-20 pb-32">
            <div className="flex items-center gap-4 mb-16">
                <Bot className="w-10 h-10 text-emerald-600" />
                <h1 className="text-4xl font-bold">Termos e Condições Legais</h1>
            </div>

            <div className="prose prose-zinc max-w-none text-zinc-600">
                <p className="text-sm uppercase tracking-widest font-bold mb-8 text-zinc-400">Última atualização: Maio 2026</p>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">1. Aceitação dos Termos</h3>
                <p>Ao se inscrever, acessar ou utilizar a Plataforma Orion de Agentes de IA ("Serviço"), você concorda em ficar vinculado a estes Termos de Serviço ("Termos"). Se você não concorda com qualquer parte dos Termos, você não deve utilizar o Serviço.</p>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">2. Integração com WhatsApp (Meta)</h3>
                <p>A Orion atua como um Middleware provedor de Inteligência Artificial para a API Nuvem Oficial do WhatsApp (Meta Inc). Ao usar nossa plataforma:</p>
                <ul className="list-disc pl-5 space-y-2 mt-4">
                    <li>Você deve concordar ativamente com a Política de Comércio e Termos de Serviço do próprio WhatsApp Business.</li>
                    <li>Não somos responsáveis por banimentos aplicados direta ou unicamente pela Meta devido à quebra de termos de spam pelo cliente (o Inquilino).</li>
                    <li>É de sua responsabilidade financeira arcar com eventuais custos de disparos por volume acima das mil (1.000) interações mensais gratuitas oferecidas pela base Meta, exceto quando declarado de outra forma no faturamento Orion.</li>
                </ul>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">3. Base de Conhecimento e Propriedade (RAG)</h3>
                <p>Ao fazer o envio (upload) de Documentos (PDF, TXT, CSV) para a sua aba de Base de Conhecimento:</p>
                <ul className="list-disc pl-5 space-y-2 mt-4">
                    <li>Você declara que tem o direito, a autorização ou a posse de tais arquivos e das regras neles expostas.</li>
                    <li><strong>A Orion renuncia a qualquer direito autoral:</strong> Nós não analisamos os seus documentos para uso público. Eles são extraídos para texto cru, indexados na nossa nuvem encriptada e visíveis unicamente pelo motor LLM interno associado à sua "org_id" para o propósito estrito de formulação de resposta.</li>
                </ul>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">4. Diretrizes de Transparência de IA (Políticas Meta)</h3>
                <p>Para manter o ecossistema seguro e alinhado aos termos globais da Meta e boas práticas de IA, o Inquilino concorda em:</p>
                <ul className="list-disc pl-5 space-y-2 mt-4">
                    <li><strong>Transparência:</strong> Deixar claro aos seus usuários (quando exigido por lei ou quando razoável) que eles estão interagindo com um Agente de Inteligência Artificial automatizado e não com um humano.</li>
                    <li><strong>Escalonamento Humano:</strong> Fornecer, através de comandos ou fluxos, um caminho claro (escalonamento) para que o cliente final consiga falar com um Atendente Humano da sua equipe caso a IA não consiga resolver o problema.</li>
                    <li><strong>Opt-Out:</strong> Respeitar a vontade do usuário caso ele peça explicitamente para parar de receber mensagens, utilizando os recursos de bloqueio ou encerramento de sessão previstos no Painel.</li>
                </ul>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">5. Limitação da IA e Perdas Indiretas</h3>
                <p>
                    Embora o Gemini 2.5 possua a mais alta tecnologia de mitigação de alucinações (quando o RAG é bem formatado),
                    a Orion não fará parte de disputas comerciais geradas por respostas indevidas oferecidas por agentes automáticos.
                    Promos erradas enviadas a clientes finais, garantias falsas ou falhas técnicas estão resguardadas pela premissa "o software é fornecido no estado em que se encontra". O lojista tem sempre um botão ao vivo para intervir em qualquer simulação no Dashboard da Orion.
                </p>
            </div>
        </div>
    );
}
