import React from "react";
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import DashboardLayout from './layouts/DashboardLayout';
import PublicLayout from './components/public/PublicLayout';
import Gatekeeper from './components/auth/Gatekeeper';

import WhatsAppConfig from './pages/dashboard/WhatsAppConfig';
import Overview from './pages/dashboard/Overview';
import LiveChat from './pages/dashboard/LiveChat';
import Campaigns from './pages/dashboard/Campaigns';
import Templates from './pages/dashboard/Templates';
import Insights from './pages/dashboard/Insights';
import Team from './pages/dashboard/Team';
import Billing from './pages/dashboard/Billing';
import Automations from './pages/dashboard/Automations';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// Public Pages
import Home from './pages/Home';
import Features from './pages/public/Features';
import Integrations from './pages/public/Integrations';
import UseCases from './pages/public/UseCases';
import Pricing from './pages/public/Pricing';
import About from './pages/public/About';
import Security from './pages/public/Security';
import Terms from './pages/public/Terms';
import Privacy from './pages/public/Privacy';
import ApiDocs from './pages/public/ApiDocs';
import MetaWebhooks from './pages/public/MetaWebhooks';
import Cookies from './pages/public/Cookies';

const GatekeeperLayout = () => {
  return (
    <Gatekeeper>
      <Outlet />
    </Gatekeeper>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        {/* Public Routes with Layout (NO GATEKEEPER) */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/funcionalidades" element={<Features />} />
          <Route path="/integracoes" element={<Integrations />} />
          <Route path="/casos-de-uso" element={<UseCases />} />
          <Route path="/precos" element={<Pricing />} />
          <Route path="/sobre" element={<About />} />
          <Route path="/seguranca" element={<Security />} />
          <Route path="/termos" element={<Terms />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route path="/webhooks" element={<MetaWebhooks />} />
          <Route path="/cookies" element={<Cookies />} />
        </Route>

        {/* Protected Area (GATEKEEPER REQUIRED) */}
        <Route element={<GatekeeperLayout />}>
          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Dashboard Routes */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Overview />} />
            <Route path="whatsapp" element={<WhatsAppConfig />} />
            <Route path="live-chat" element={<LiveChat />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="templates" element={<Templates />} />
            <Route path="insights" element={<Insights />} />
            <Route path="team" element={<Team />} />
            <Route path="billing" element={<Billing />} />
            <Route path="settings" element={<Settings />} />
            <Route path="automations" element={<Automations />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
