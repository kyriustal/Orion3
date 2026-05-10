import { Code2, Braces, Terminal, Lock } from "lucide-react";

export default function ApiDocs() {
    return (
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-32">
            <div className="mb-20">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-6">
                    <Code2 className="w-4 h-4" />
                    <span>Developer Preview</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6">Referência de API</h1>
                <p className="text-xl text-zinc-600 max-w-2xl">Use as APIs e os webhooks interligados do Orion para enviar, acionar conversas, injetar documentos programaticamente ou criar fluxos Node.js externos.</p>
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-12 gap-12">
                <aside className="lg:col-span-3">
                    <nav className="sticky top-10 space-y-1">
                        <div className="font-bold text-zinc-900 mb-4 tracking-wider text-xs uppercase">Conceitos Core</div>
                        <a href="#auth" className="block text-sm text-zinc-500 hover:text-emerald-600 font-medium py-1">Autenticação</a>
                        <a href="#rag" className="block text-sm text-zinc-500 hover:text-emerald-600 font-medium py-1">Upload RAG</a>
                        <a href="#webhook" className="block text-sm text-zinc-500 hover:text-emerald-600 font-medium py-1">Conexão Meta Webhook</a>
                    </nav>
                </aside>

                <section className="lg:col-span-9 space-y-20">

                    <div id="auth">
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3"><LockIcon /> Autenticação via Chave</h2>
                        <p className="text-zinc-600 mb-6">Todas as chamadas que não utilizam o Painel de Controle oficial via React exigem um Cabeçalho HTTPS com sua `Authorization: Bearer ORION_SECRET`.</p>
                        <div className="bg-[#1e1e1e] rounded-xl p-6 text-emerald-400 font-mono text-sm overflow-x-auto shadow-xl">
                            <pre>
                                {`curl -X GET 'https://api.orionboot.com/v1/sessions' \\
-H 'Authorization: Bearer orion_sec_3kdas934...'`}
                            </pre>
                        </div>
                    </div>

                    <div id="rag">
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3"><FileIcon /> Envio Remoto de Base de Conhecimento</h2>
                        <p className="text-zinc-600 mb-6">Integre seu ERP com a rotina principal para enviar estoque e PDFs na rota <code>POST /api/knowledge/upload</code> de forma que o agente seja treinado passivamente todas as noites.</p>
                        <div className="bg-[#1e1e1e] rounded-xl p-6 text-zinc-300 font-mono text-sm overflow-x-auto shadow-xl">
                            <pre>
                                {`import fs from "fs";

const form = new FormData();
form.append("file", fs.createReadStream("./pdf/novos_precos.pdf"));

// Nossa API absorve o arquivo com PDF-Parse e atualiza 
// a regra invisível para o Gemini do cliente.
fetch('https://localhost:3000/api/knowledge/upload', {
  method: 'POST',
  body: form,
  headers: {
    'Authorization': 'Bearer <ACCESS_TOKEN>'
  }
});`}
                            </pre>
                        </div>
                    </div>

                    <div id="webhook">
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3"><WebhookIcon /> Aceitando a Conexão Meta Oficial</h2>
                        <p className="text-zinc-600 mb-6">Se você está subindo nossa solução internamente no seu próprio servidor, certifique-se de configurar o Meta App Developer com o endpoint do `webhook.ts`. Ele lida sozinho com o `hub.challenge` de assinatura.</p>
                        <ul className="list-disc pl-5 mb-6 text-zinc-600">
                            <li><strong>URL de Retorno de Chamada (Callback URL):</strong> `https://yourapp.com/api/webhook`</li>
                            <li><strong>Token de Verificação (Verify Token):</strong> Igual à sua Váriavel `.env` no `META_VERIFY_TOKEN` (padrão do código: <i>orion_secure_token_123</i>)</li>
                            <li><strong>Assinatura Obrigatória:</strong> Assine o campo `messages`. Nosso script já percorre a árvore `body.entry[0].changes[0].value.messages`.</li>
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    );
}

function LockIcon() { return <Lock className="w-5 h-5 text-emerald-500" />; }
function FileIcon() { return <Braces className="w-5 h-5 text-emerald-500" />; }
function WebhookIcon() { return <Terminal className="w-5 h-5 text-emerald-500" />; }
