import { Cookie, Bot } from "lucide-react";

export default function Cookies() {
    return (
        <div className="max-w-4xl mx-auto px-6 pt-20 pb-32">
            <div className="flex items-center gap-4 mb-16">
                <Cookie className="w-10 h-10 text-emerald-600" />
                <h1 className="text-4xl font-bold">Política de Cookies</h1>
            </div>

            <div className="prose prose-zinc max-w-none text-zinc-600">
                <p className="text-sm uppercase tracking-widest font-bold mb-8 text-zinc-400">Última atualização: Maio 2026</p>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">1. O que são Cookies?</h3>
                <p>Cookies são pequenos arquivos de texto armazenados no seu navegador para melhorar sua experiência, lembrar suas preferências e garantir a segurança da sua sessão no Painel Orion.</p>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">2. Como utilizamos os Cookies?</h3>
                <ul className="list-disc pl-5 space-y-2 mt-4">
                    <li><strong>Essenciais:</strong> Necessários para você fazer login e navegar no Dashboard com segurança.</li>
                    <li><strong>Funcionais:</strong> Lembram o idioma escolhido e configurações de exibição da IA.</li>
                    <li><strong>Analíticos:</strong> Ajudam-nos a entender como os usuários interagem com a Landing Page para melhorarmos a plataforma.</li>
                </ul>

                <h3 className="text-2xl font-bold text-zinc-900 mt-12 mb-4">3. Controle de Cookies</h3>
                <p>Você pode gerenciar ou desativar os cookies diretamente nas configurações do seu navegador. Note que desativar cookies essenciais pode impedir o funcionamento correto do nosso Painel de Controle.</p>
            </div>
        </div>
    );
}
