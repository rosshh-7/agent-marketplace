import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page page-narrow notfound">
      <div className="notfound-code gradient-text">404</div>
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" className="btn-secondary">
        Back to AgentMarket
      </Link>
    </div>
  );
}
