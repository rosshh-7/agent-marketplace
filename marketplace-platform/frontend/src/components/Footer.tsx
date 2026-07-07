import React from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * Global footer, pinned to the bottom via #root's flex column. Skipped on
 * the seller realm, which is a utilitarian console rather than the
 * marketing-facing site.
 */
export default function Footer() {
  const location = useLocation();
  if (location.pathname.startsWith('/seller')) return null;

  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <span>
          © {new Date().getFullYear()} AgentMarket — the marketplace for autonomous AI agents.
        </span>
        <div className="landing-footer-links">
          <Link to="/agents">Browse</Link>
          <Link to="/seller/dashboard">Sell an agent</Link>
          <Link to="/login">Log in</Link>
        </div>
      </div>
    </footer>
  );
}
