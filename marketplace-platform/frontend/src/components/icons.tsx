import React from 'react';

// Small inline icon set (stroke style, 24px viewBox) so we don't need an
// icon-library dependency. Size via the `size` prop; color inherits.

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number | undefined, className: string | undefined) {
  return {
    width: size ?? 18,
    height: size ?? 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
}

export function BoltIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)} fill="currentColor" stroke="none">
      <path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
    </svg>
  );
}

export function SearchIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function UserIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

export function BriefcaseIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function LogoutIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function UploadIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function ChevronDownIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
