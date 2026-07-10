import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { useSellerAuth } from '../context/SellerAuthContext';
import UserMenu from './UserMenu';
import { BoltIcon, BriefcaseIcon, SearchIcon, UploadIcon, UserIcon } from './icons';

/** Elevation shadow once content scrolls under the sticky navbar. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return scrolled;
}

/**
 * A single top nav that switches between the customer and seller realms
 * based on the current path. Each realm shows only its own auth state —
 * a customer being logged in has no bearing on the seller links and vice
 * versa, matching the two separate auth realms in the contract.
 */
export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const customerAuth = useCustomerAuth();
  const sellerAuth = useSellerAuth();
  const isSellerSide = location.pathname.startsWith('/seller');
  const scrolled = useScrolled();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link active' : 'nav-link';
  // Variant hidden on small screens — these links reappear inside the
  // avatar dropdown, so nothing is unreachable on mobile.
  const navLinkClassMobile = ({ isActive }: { isActive: boolean }) =>
    `${navLinkClass({ isActive })} nav-hide-mobile`;

  if (isSellerSide) {
    return (
      <nav className="navbar" data-scrolled={scrolled}>
        <div className="navbar-brand">
          <Link to="/seller/dashboard">
            <span className="brand-mark">
              <BoltIcon size={16} />
            </span>
            AgentMarket <span className="brand-suffix">· Seller</span>
          </Link>
        </div>
        <div className="navbar-links">
          <Link to="/" className="nav-link nav-hide-mobile">
            Customer site
          </Link>
          <NavLink to="/docs/build-agents" className={navLinkClassMobile}>
            Docs
          </NavLink>
          {sellerAuth.isAuthenticated ? (
            <>
              <NavLink to="/seller/dashboard" className={navLinkClassMobile} end>
                My submissions
              </NavLink>
              <NavLink to="/seller/agents/new" className={navLinkClassMobile}>
                Upload agent
              </NavLink>
              <UserMenu
                email={sellerAuth.seller?.email ?? ''}
                realmLabel={sellerAuth.seller?.company_name || 'Seller account'}
                links={[
                  { to: '/seller/dashboard', label: 'My submissions', icon: <BriefcaseIcon /> },
                  { to: '/seller/agents/new', label: 'Upload agent', icon: <UploadIcon /> },
                ]}
                onLogout={() => {
                  sellerAuth.logout();
                  navigate('/seller/login');
                }}
              />
            </>
          ) : (
            <>
              <NavLink to="/seller/login" className={navLinkClass}>
                Log in
              </NavLink>
              <Link to="/seller/signup" className="navbar-seller-link">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    );
  }

  return (
    <nav className="navbar" data-scrolled={scrolled}>
      <div className="navbar-brand">
        <Link to="/">
          <span className="brand-mark">
            <BoltIcon size={16} />
          </span>
          AgentMarket
        </Link>
      </div>
      <div className="navbar-links">
        <NavLink to="/agents" className={navLinkClassMobile}>
          Browse agents
        </NavLink>
        {customerAuth.isAuthenticated ? (
          <>
            <NavLink to="/dashboard" className={navLinkClassMobile} end>
              My jobs
            </NavLink>
            <Link to="/seller/dashboard" className="navbar-seller-link nav-hide-mobile">
              List your agent
            </Link>
            <UserMenu
              email={customerAuth.user?.email ?? ''}
              realmLabel="Customer account"
              links={[
                { to: '/profile', label: 'Profile', icon: <UserIcon /> },
                { to: '/dashboard', label: 'My jobs', icon: <BriefcaseIcon /> },
                { to: '/agents', label: 'Browse agents', icon: <SearchIcon /> },
              ]}
              onLogout={() => {
                customerAuth.logout();
                navigate('/');
              }}
            />
          </>
        ) : (
          <>
            <NavLink to="/login" className={navLinkClass}>
              Log in
            </NavLink>
            <Link to="/seller/dashboard" className="navbar-seller-link nav-hide-mobile">
              List your agent
            </Link>
            <Link to="/signup" className="btn-primary nav-cta">
              Get started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
