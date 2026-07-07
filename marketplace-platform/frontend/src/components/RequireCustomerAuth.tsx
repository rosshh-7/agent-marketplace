import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCustomerAuth } from '../context/CustomerAuthContext';

/** Gate for customer-only routes (hire flow, dashboard). */
export default function RequireCustomerAuth({ children }: { children: React.ReactElement }) {
  const { isAuthenticated, isLoading } = useCustomerAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="page-loading">Loading…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
