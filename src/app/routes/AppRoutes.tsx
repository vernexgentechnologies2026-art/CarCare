import { useState, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import { RouteErrorPage, Spinner } from '@/components/feedback';
import { LoginPage } from '@/features/auth/LoginPage';
import { ForbiddenPage, NotFoundPage } from '@/features/auth/StatusPages';
import { AdminLayout } from '../layouts/AdminLayout';
import { CleanerLayout } from '../layouts/CleanerLayout';
import { CustomerLayout } from '../layouts/CustomerLayout';
import { RootLayout } from '../layouts/RootLayout';
import { PublicOnly, RequireApprovedResident, RequireRole, RoleHomeRedirect } from './ProtectedRoutes';

/**
 * Lazily loads a named page export, so each role downloads only its own
 * screens (residents and cleaners on mobile data never fetch the admin bundle).
 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const mod = await load();
      return { Component: mod[name] as ComponentType };
    },
  };
}

const to = (path: string) => <Navigate to={path} replace />;

const appRoutes: RouteObject[] = [
  { path: '/', element: <RoleHomeRedirect /> },
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/customer/register', ...page(() => import('@/features/customer/RegistrationPage'), 'RegistrationPage') },
      { path: '/register', element: to('/customer/register') },
    ],
  },
  {
    element: <RequireRole roles={['CUSTOMER']} />,
    children: [
      { path: '/customer/approval-status', ...page(() => import('@/features/customer/ApprovalStatusPage'), 'ApprovalStatusPage') },
      {
        element: <RequireApprovedResident />,
        children: [
          {
            path: '/customer',
            element: <CustomerLayout />,
            children: [
              { index: true, element: to('/customer/dashboard') },
              { path: 'dashboard', ...page(() => import('@/features/customer/DashboardPage'), 'CustomerDashboardPage') },
              { path: 'packages', ...page(() => import('@/features/customer/PackagesPage'), 'CustomerPackagesPage') },
              { path: 'photos', ...page(() => import('@/features/customer/PhotoGalleryPage'), 'PhotoGalleryPage') },
              { path: 'reschedule', ...page(() => import('@/features/customer/ReschedulePage'), 'ReschedulePage') },
              { path: 'invoices', ...page(() => import('@/features/customer/InvoicesPage'), 'InvoicesPage') },
              { path: 'account', ...page(() => import('@/features/customer/ProfilePage'), 'ProfilePage') },
            ],
          },
        ],
      },
    ],
  },
  {
    element: <RequireRole roles={['CLEANER']} />,
    children: [
      {
        path: '/cleaner',
        element: <CleanerLayout />,
        children: [
          { index: true, element: to('/cleaner/today') },
          { path: 'today', ...page(() => import('@/features/cleaner/TodaysJobsPage'), 'TodaysJobsPage') },
          { path: 'jobs/:jobId', ...page(() => import('@/features/cleaner/JobDetailPage'), 'JobDetailPage') },
          { path: 'jobs/:jobId/complete', ...page(() => import('@/features/cleaner/WashCompletionPage'), 'WashCompletionPage') },
          { path: 'jobs/:jobId/vnp', ...page(() => import('@/features/cleaner/JobDetailPage'), 'JobDetailPage') },
          { path: 'schedule', ...page(() => import('@/features/cleaner/WeeklySchedulePage'), 'WeeklySchedulePage') },
          { path: 'customers', ...page(() => import('@/features/cleaner/MyCustomersPage'), 'MyCustomersPage') },
          { path: 'targets', ...page(() => import('@/features/cleaner/TargetsPage'), 'TargetsPage') },
        ],
      },
    ],
  },
  {
    element: <RequireRole roles={['ADMIN']} />,
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: to('/admin/dashboard') },
          { path: 'dashboard', ...page(() => import('@/features/admin/AdminDashboardPage'), 'AdminDashboardPage') },
          { path: 'customers', ...page(() => import('@/features/admin/CustomersPage'), 'CustomersPage') },
          { path: 'cleaners', ...page(() => import('@/features/admin/CleanerAllocationPage'), 'CleanerAllocationPage') },
          { path: 'packages', ...page(() => import('@/features/admin/PackagesPage'), 'PackagesPage') },
          { path: 'schedules', ...page(() => import('@/features/schedules/SchedulesPage'), 'SchedulesPage') },
          { path: 'payments', ...page(() => import('@/features/payments/PaymentsLedgerPage'), 'PaymentsLedgerPage') },
          { path: 'photos', ...page(() => import('@/features/admin/PhotoAuditPage'), 'PhotoAuditPage') },
          { path: 'audit-log', ...page(() => import('@/features/admin/AuditLogPage'), 'AuditLogPage') },
        ],
      },
    ],
  },
  { path: '/forbidden', element: <ForbiddenPage /> },
  { path: '*', element: <NotFoundPage /> },
];

export const routes: RouteObject[] = [
  { element: <RootLayout />, errorElement: <RouteErrorPage />, hydrateFallbackElement: <Spinner />, children: appRoutes },
];

/** Opt in to React Router v7 behaviour now so the upgrade is a no-op. */
export const ROUTER_FUTURE = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const;

export function AppRoutes() {
  // Created on first render, not at import, so tests can import `routes` without a browser router.
  const [router] = useState(() => createBrowserRouter(routes, { future: ROUTER_FUTURE }));
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
