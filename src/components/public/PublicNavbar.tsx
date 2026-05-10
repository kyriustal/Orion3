import { Link } from "react-router-dom";
import { Button } from "@/src/components/ui/button";

export default function PublicNavbar() {
    return (
        <nav className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-b border-zinc-100 z-50">
            <div className="max-w-7xl mx-auto px-6 h-full grid grid-cols-2 md:grid-cols-3 items-center">
                <div className="flex justify-start border-red-500">
                    <Link to="/" className="flex items-center gap-2">
                        <img src="/Orion.png" alt="Orion Logo" className="w-32 md:w-40 h-auto" />
                    </Link>
                </div>
                <div className="hidden lg:flex items-center justify-center gap-8">
                    <Link to="/funcionalidades" className="text-sm font-medium text-zinc-600 hover:text-emerald-600 transition-colors">Funcionalidades</Link>
                    <Link to="/casos-de-uso" className="text-sm font-medium text-zinc-600 hover:text-emerald-600 transition-colors text-center">Casos de Uso</Link>
                    <Link to="/precos" className="text-sm font-medium text-zinc-600 hover:text-emerald-600 transition-colors">Preços</Link>
                    <Link to="/sobre" className="text-sm font-medium text-zinc-600 hover:text-emerald-600 transition-colors">Sobre Nós</Link>
                </div>
                <div className="flex items-center justify-end gap-4">
                    <Link to="/login" target="_blank">
                        <Button variant="ghost" className="hidden lg:inline-flex font-medium">Entrar</Button>
                    </Link>
                    <Link to="/register" target="_blank">
                        <Button className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
                            Criar Agente
                        </Button>
                    </Link>
                </div>
            </div>
        </nav>
    );
}
