import { Outlet } from "react-router-dom";
import PublicNavbar from "./PublicNavbar";
import PublicFooter from "./PublicFooter";
import { PageTransition } from "../ui/PageTransition";

export default function PublicLayout() {
    return (
        <div className="min-h-screen flex flex-col bg-white text-zinc-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
            <PublicNavbar />
            <main className="flex-1 flex flex-col">
                <PageTransition>
                    <Outlet />
                </PageTransition>
            </main>
            <PublicFooter />
        </div>
    );
}
