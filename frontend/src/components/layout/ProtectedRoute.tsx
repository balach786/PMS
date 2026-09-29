import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import type { Permissions } from '../../lib/types';

export function ProtectedRoute({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: keyof Permissions;
}) {
  const { user, initialised, permissions } = useAuth();
  const location = useLocation();

  if (!initialised) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-navy-700" />
          <p className="text-sm text-ink-500">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !permissions[permission]) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, initialised } = useAuth();
  if (!initialised) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Loader2 className="h-7 w-7 animate-spin text-navy-700" />
      </div>
    );
  }
  if (user) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}
