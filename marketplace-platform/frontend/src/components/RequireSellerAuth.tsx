import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSellerAuth } from '../context/SellerAuthContext';

/** Gate for seller-only routes (seller dashboard, upload flow). */
export default function RequireSellerAuth({ children }: { children: React.ReactElement }) {
  const { isAuthenticated, isLoading } = useSellerAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="page-loading">Loading…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/seller/login" replace state={{ from: location }} />;
  }
  return children;
}
