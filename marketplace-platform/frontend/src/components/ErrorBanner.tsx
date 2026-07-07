import React from 'react';

export default function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="error-banner">{message}</div>;
}
