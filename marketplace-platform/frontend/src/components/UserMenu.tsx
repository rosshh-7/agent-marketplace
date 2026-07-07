import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, LogoutIcon } from './icons';

export interface UserMenuLink {
  to: string;
  label: string;
  icon: React.ReactNode;
}

interface UserMenuProps {
  email: string;
  /** Line shown above the email in the dropdown header, e.g. "Customer account". */
  realmLabel: string;
  links: UserMenuLink[];
  onLogout: () => void;
}

function initialsFromEmail(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

/**
 * Avatar button + dropdown used in the navbar for both auth realms.
 * Closes on outside click and Escape.
 */
export default function UserMenu({ email, realmLabel, links, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar">{initialsFromEmail(email)}</span>
        <ChevronDownIcon size={14} className="avatar-caret" />
      </button>

      {open ? (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-header">
            <div className="user-menu-name">{realmLabel}</div>
            <div className="user-menu-email">{email}</div>
          </div>
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
          <hr className="user-menu-divider" />
          <button
            type="button"
            className="user-menu-item danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogoutIcon />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
