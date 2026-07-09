import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { CustomerAuthProvider } from './context/CustomerAuthContext';
import { SellerAuthProvider } from './context/SellerAuthContext';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import RequireCustomerAuth from './components/RequireCustomerAuth';
import RequireSellerAuth from './components/RequireSellerAuth';

import LandingPage from './pages/LandingPage';
import BrowseAgentsPage from './pages/BrowseAgentsPage';
import ProfilePage from './pages/ProfilePage';
import AgentDetailPage from './pages/AgentDetailPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import JobDetailPage from './pages/JobDetailPage';
import SellerLoginPage from './pages/SellerLoginPage';
import SellerSignupPage from './pages/SellerSignupPage';
import SellerDashboardPage from './pages/SellerDashboardPage';
import SellerAgentUploadPage from './pages/SellerAgentUploadPage';
import SellerSubmissionDetailPage from './pages/SellerSubmissionDetailPage';
import NotFoundPage from './pages/NotFoundPage';

/* The landing page manages its own section widths and needs to span the
   full viewport (hero glow, CTA band); every other page uses the standard
   centered column. Keying by pathname replays the enter animation on every
   route change. */
function AppMain({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  return (
    <main
      key={location.pathname}
      className={`${isLanding ? 'app-main full-bleed' : 'app-main'} route-fade`}
    >
      {children}
    </main>
  );
}

export default function App() {
  return (
    <CustomerAuthProvider>
      <SellerAuthProvider>
        <BrowserRouter>
          <Navbar />
          <AppMain>
            <Routes>
              {/* Customer journey — PLATFORM_CONTRACT.md §9 */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/agents" element={<BrowseAgentsPage />} />
              <Route path="/agents/:agentId" element={<AgentDetailPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route
                path="/profile"
                element={
                  <RequireCustomerAuth>
                    <ProfilePage />
                  </RequireCustomerAuth>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <RequireCustomerAuth>
                    <DashboardPage />
                  </RequireCustomerAuth>
                }
              />
              <Route
                path="/dashboard/jobs/:jobId"
                element={
                  <RequireCustomerAuth>
                    <JobDetailPage />
                  </RequireCustomerAuth>
                }
              />

              {/* Seller journey */}
              <Route path="/seller/login" element={<SellerLoginPage />} />
              <Route path="/seller/signup" element={<SellerSignupPage />} />
              <Route
                path="/seller/dashboard"
                element={
                  <RequireSellerAuth>
                    <SellerDashboardPage />
                  </RequireSellerAuth>
                }
              />
              <Route
                path="/seller/agents/new"
                element={
                  <RequireSellerAuth>
                    <SellerAgentUploadPage />
                  </RequireSellerAuth>
                }
              />
              <Route
                path="/seller/agents/:submissionId"
                element={
                  <RequireSellerAuth>
                    <SellerSubmissionDetailPage />
                  </RequireSellerAuth>
                }
              />

              <Route path="/404" element={<NotFoundPage />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </AppMain>
          <Footer />
        </BrowserRouter>
      </SellerAuthProvider>
    </CustomerAuthProvider>
  );
}
