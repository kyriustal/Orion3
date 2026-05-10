import { Link } from "react-router-dom";
import { Bot, MessageSquare, Zap, ShieldCheck } from "lucide-react";

export default function PublicFooter() {
    return (
        <footer className="bg-zinc-50 border-t border-zinc-200 py-16 md:py-20 mt-auto w-full">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 md:gap-12">
                <div className="sm:col-span-2">
                    <div className="flex items-center gap-2 mb-6">
                        <img src="/Orion.png" alt="Orion Logo" className="h-8 w-auto" />
                    </div>
                    <p className="text-sm text-zinc-500 mb-6 max-w-sm">
                        Construtor de Agentes de Inteligência Artificial para WhatsApp.
                        Treine sua IA com seus documentos e atenda milhares de clientes 24/7.
                    </p>
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-600">
                        <span>🇧🇷</span> Português (BR)
                    </div>
                </div>

                <div>
                    <h4 className="font-bold mb-4 md:mb-6 text-zinc-900">Produto</h4>
                    <ul className="space-y-3 md:space-y-4 text-sm text-zinc-500">
                        <li><Link to="/whatsapp-ia" className="hover:text-emerald-600 transition-colors flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Whatsapp IA</Link></li>
                        <li><Link to="/rag" className="hover:text-emerald-600 transition-colors flex items-center gap-2"><Bot className="w-4 h-4" /> Base de Conhecimento RAG</Link></li>
                        <li><Link to="/integracoes" className="hover:text-emerald-600 transition-colors flex items-center gap-2"><Zap className="w-4 h-4" /> Integrações</Link></li>
                        <li><Link to="/precos" className="hover:text-emerald-600 transition-colors">Preços</Link></li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-bold mb-4 md:mb-6 text-zinc-900">Desenvolvedores</h4>
                    <ul className="space-y-3 md:space-y-4 text-sm text-zinc-500">
                        <li><Link to="/api-docs" className="hover:text-emerald-600 transition-colors">Documentação da API</Link></li>
                        <li><Link to="/webhooks" className="hover:text-emerald-600 transition-colors">Webhooks Meta</Link></li>
                        <li><Link to="/casos-de-uso" className="hover:text-emerald-600 transition-colors">Casos de Uso</Link></li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-bold mb-4 md:mb-6 text-zinc-900">Empresa</h4>
                    <ul className="space-y-3 md:space-y-4 text-sm text-zinc-500">
                        <li><Link to="/sobre" className="hover:text-emerald-600 transition-colors">Sobre nós</Link></li>
                        <li><Link to="/seguranca" className="hover:text-emerald-600 transition-colors flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Segurança e LGPD</Link></li>
                        <li><Link to="/termos" className="hover:text-emerald-600 transition-colors">Termos de Serviço</Link></li>
                        <li><Link to="/privacidade" className="hover:text-emerald-600 transition-colors">Privacidade</Link></li>
                        <li><Link to="/cookies" className="hover:text-emerald-600 transition-colors">Política de Cookies</Link></li>
                    </ul>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-zinc-200 text-xs text-zinc-400 flex flex-col md:flex-row justify-between items-center gap-4">
                <p>&copy; {new Date().getFullYear()} Orion AI Inc. Todos os direitos reservados.</p>
                <p>Criado por <a href="https://www.dynastycreator.tech" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-500 transition-colors font-medium">Dynasty</a></p>
                <p>Desenvolvido orgulhosamente como SaaS para Agentes Inteligentes.</p>
            </div>
        </footer>
    );
}
