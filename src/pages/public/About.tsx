import { Users, Code, Globe2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/src/components/ui/button";

export default function About() {
    return (
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-32">
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-20">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6">Democratizando as IAs Autônomas.</h1>
                <p className="text-lg md:text-xl text-zinc-600">Nossa missão é colocar o poder dos modelos fundacionais das Big Techs diretamente no bolso de cada pequeno e médio empreendedor brasileiro de forma inteligente, barata e via WhatsApp.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-20 md:mb-32">
                <div>
                    <h2 className="text-3xl font-bold mb-6">A Era da Geração Aumentada (RAG)</h2>
                    <p className="text-lg text-zinc-600 mb-6">
                        Durante anos, os "chatbots" não passavam de fluxogramas engessados ("Digite 1 para Sim"). Com a explosão do Google Gemini e GPT, o mercado foi tentado a colocar IAs livres no WhatsApp, apenas para descobrir que elas recomendam produtos de concorrentes ou inventam preços.
                    </p>
                    <p className="text-lg text-zinc-600">
                        A Orion foi fundada para unir o melhor dos dois mundos. Através da técnica de RAG (Retrieval-Augmented Generation), construímos a infraestrutura onde a IA responde com fluidez humana, mas seu conhecimento está preso em uma "caixa" de regras da empresa, lendo milhares de PDFs instantaneamente antes de disparar a resposta de volta ao Zap.
                    </p>
                </div>
                <div className="bg-zinc-100 rounded-[2rem] p-12 flex items-center justify-center">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="w-32 h-32 bg-white rounded-2xl shadow-sm flex items-center justify-center flex-col gap-2">
                            <Globe2 className="w-8 h-8 text-emerald-600" />
                            <span className="font-bold text-sm">Escala</span>
                        </div>
                        <div className="w-32 h-32 bg-white rounded-2xl shadow-sm flex items-center justify-center flex-col gap-2 mt-8">
                            <Users className="w-8 h-8 text-blue-600" />
                            <span className="font-bold text-sm">Nível 1</span>
                        </div>
                        <div className="w-32 h-32 bg-white rounded-2xl shadow-sm flex items-center justify-center flex-col gap-2">
                            <Code className="w-8 h-8 text-purple-600" />
                            <span className="font-bold text-sm">LLMs</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-zinc-900 text-white rounded-[1.5rem] md:rounded-[2rem] p-8 md:p-16 text-center">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6">Pronto para transformar sua operação?</h2>
                <p className="text-lg md:text-xl text-zinc-400 mb-8 md:mb-10 max-w-2xl mx-auto">
                    Faça parte de uma nova era de suporte. Substitua filas de espera, chamados parados e agentes cansados por respostas imediatas e inteligentes.
                </p>
                <Link to="/register" target="_blank">
                    <Button className="w-full sm:w-auto rounded-full bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-6 text-lg font-bold">Criar Minha Conta</Button>
                </Link>
            </div>
        </div>
    );
}
