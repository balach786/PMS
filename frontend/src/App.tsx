import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute, PublicOnlyRoute } from './components/layout/ProtectedRoute';
import { Logo } from './components/Logo';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import FuelPrices from './pages/FuelPrices';
import Sales from './pages/Sales';
import Shifts from './pages/Shifts';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Fuels from './pages/Fuels';
import Stock from './pages/Stock';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Receipt from './pages/Receipt';

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50 px-6 text-center">
      <Logo className="h-14 w-14" />
      <h1 className="text-2xl font-bold text-navy-900">Page not found</h1>
      <p className="text-sm text-ink-500">The page you are looking for does not exist.</p>
      <a href="/" className="btn-primary btn-sm">
        Back to home
      </a>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <Login />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicOnlyRoute>
                  <Register />
                </PublicOnlyRoute>
              }
            />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="fuel-prices" element={<FuelPrices />} />
              <Route
                path="sales"
                element={
                  <ProtectedRoute permission="sales">
                    <Sales />
                  </ProtectedRoute>
                }
              />
              <Route path="sales/:id/receipt" element={<Receipt />} />
              <Route
                path="shifts"
                element={
                  <ProtectedRoute permission="shifts">
                    <Shifts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="customers"
                element={
                  <ProtectedRoute permission="customers">
                    <Customers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="expenses"
                element={
                  <ProtectedRoute permission="expenses">
                    <Expenses />
                  </ProtectedRoute>
                }
              />
              <Route
                path="purchases"
                element={
                  <ProtectedRoute permission="purchases">
                    <Purchases />
                  </ProtectedRoute>
                }
              />
              <Route
                path="suppliers"
                element={
                  <ProtectedRoute permission="suppliers">
                    <Suppliers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="fuels"
                element={
                  <ProtectedRoute permission="fuels">
                    <Fuels />
                  </ProtectedRoute>
                }
              />
              <Route
                path="stock"
                element={
                  <ProtectedRoute permission="stock">
                    <Stock />
                  </ProtectedRoute>
                }
              />
              <Route
                path="reports"
                element={
                  <ProtectedRoute permission="reports">
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute permission="users">
                    <Users />
                  </ProtectedRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <ProtectedRoute permission="settings">
                    <Settings />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
