// Build revision: 2026-10-08-login-chunk-fix
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './core/hooks';
import { ProtectedRoute, FamilyProtectedRoute, PublicRoute, LoadingSpinner } from './core/components';
import { AppShell } from './app/components';
import { initAuthStorage } from './core/utils/auth-storage';
import { AcceptInvite } from './app/pages/AcceptInvite';
import { Dashboard } from './app/pages/Dashboard';
import { DashboardSelector } from './app/pages/DashboardSelector';
import { Login } from './app/pages/Login';
import { Logout } from './app/pages/Logout';
import { Signup } from './app/pages/Signup';
import { Onboarding } from './app/pages/Onboarding';
import { NotFound } from './app/pages/NotFound';
import { DemoModeBar } from './demo';
import { FamilyPortalLayout } from './app/layouts/FamilyPortalLayout';
import {
  FamilyDashboard,
  FamilySettings,
  ActivityPage,
  MessagesPage,
  StaffMessagesPage,
  NotificationsPage,
  SchedulePage,
  CarePlanPage,
  HealthUpdatesPage
} from './verticals/family-engagement/pages';
import { GlobalSearch, useGlobalSearch } from './components/search/GlobalSearch';

// Lazy loaded dashboards
const AdministratorDashboard = React.lazy(() => import('./app/pages/AdministratorDashboard').then((m) => ({ default: m.AdministratorDashboard })));
const ComplianceDashboard = React.lazy(() => import('./app/pages/ComplianceDashboard').then((m) => ({ default: m.ComplianceDashboard })));
const NurseDashboard = React.lazy(() => import('./app/pages/NurseDashboard').then((m) => ({ default: m.NurseDashboard })));
const CaregiverDashboard = React.lazy(() => import('./app/pages/CaregiverDashboard').then((m) => ({ default: m.CaregiverDashboard })));

// Lazy loaded heavy rarely-visited pages
const Settings = React.lazy(() => import('./app/pages/Settings').then((m) => ({ default: m.Settings })));
const MobileDemoPage = React.lazy(() => import('./app/pages/MobileDemoPage').then((m) => ({ default: m.MobileDemoPage })));
const AnalyticsAdminDashboard = React.lazy(() => import('./app/pages/analytics/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const CoordinatorDashboard = React.lazy(() => import('./app/pages/analytics/CoordinatorDashboard').then((m) => ({ default: m.CoordinatorDashboard })));
const ReportsPage = React.lazy(() => import('./app/pages/analytics/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const QADashboard = React.lazy(() => import('./verticals/quality-assurance/pages/QADashboard').then((m) => ({ default: m.QADashboard })));
const AuditsPage = React.lazy(() => import('./verticals/quality-assurance/pages/AuditsPage').then((m) => ({ default: m.AuditsPage })));
const AuditDetailPage = React.lazy(() => import('./verticals/quality-assurance/pages/AuditDetailPage').then((m) => ({ default: m.AuditDetailPage })));
const CorrectiveActionsPage = React.lazy(() => import('./verticals/quality-assurance/pages/CorrectiveActionsPage').then((m) => ({ default: m.CorrectiveActionsPage })));
const CreateAuditPage = React.lazy(() => import('./verticals/quality-assurance/pages/CreateAuditPage').then((m) => ({ default: m.CreateAuditPage })));

// Lazy loaded vertical pages
const ClientList = React.lazy(() => import('./verticals/client-demographics/pages/ClientList').then((m) => ({ default: m.ClientList })));
const ClientDetail = React.lazy(() => import('./verticals/client-demographics/pages/ClientDetail').then((m) => ({ default: m.ClientDetail })));
const ClientDashboard = React.lazy(() => import('./verticals/client-demographics/pages/ClientDashboard').then((m) => ({ default: m.ClientDashboard })));

const CarePlanList = React.lazy(() => import('./verticals/care-plans/pages/CarePlanList').then((m) => ({ default: m.CarePlanList })));
const CarePlanDetail = React.lazy(() => import('./verticals/care-plans/pages/CarePlanDetail').then((m) => ({ default: m.CarePlanDetail })));
const TaskList = React.lazy(() => import('./verticals/care-plans/pages/TaskList').then((m) => ({ default: m.TaskList })));
const CreateCarePlanPage = React.lazy(() => import('./verticals/care-plans/pages/CreateCarePlanPage').then((m) => ({ default: m.CreateCarePlanPage })));
const CreateFromTemplatePage = React.lazy(() => import('./verticals/care-plans/pages/CreateFromTemplatePage').then((m) => ({ default: m.CreateFromTemplatePage })));
const CustomizeTemplatePage = React.lazy(() => import('./verticals/care-plans/pages/CustomizeTemplatePage').then((m) => ({ default: m.CustomizeTemplatePage })));
const EditCarePlanPage = React.lazy(() => import('./verticals/care-plans/pages/EditCarePlanPage').then((m) => ({ default: m.EditCarePlanPage })));
const CaregiverTasksPage = React.lazy(() => import('./verticals/care-plans/pages/caregiver/CaregiverTasksPage').then((m) => ({ default: m.CaregiverTasksPage })));
const TaskDetailPage = React.lazy(() => import('./verticals/care-plans/pages/caregiver/TaskDetailPage').then((m) => ({ default: m.TaskDetailPage })));
const ProgressNotesPage = React.lazy(() => import('./verticals/care-plans/pages/ProgressNotesPage').then((m) => ({ default: m.ProgressNotesPage })));

const EVVRecordList = React.lazy(() => import('./verticals/time-tracking-evv/pages/EVVRecordList').then((m) => ({ default: m.EVVRecordList })));
const EVVRecordDetail = React.lazy(() => import('./verticals/time-tracking-evv/pages/EVVRecordDetail').then((m) => ({ default: m.EVVRecordDetail })));
const SubmissionTrackingDashboard = React.lazy(() => import('./verticals/time-tracking-evv/components/SubmissionTrackingDashboard').then((m) => ({ default: m.SubmissionTrackingDashboard })));

const InvoiceList = React.lazy(() => import('./verticals/billing-invoicing/pages/InvoiceList').then((m) => ({ default: m.InvoiceList })));
const InvoiceDetail = React.lazy(() => import('./verticals/billing-invoicing/pages/InvoiceDetail').then((m) => ({ default: m.InvoiceDetail })));
const InvoiceForm = React.lazy(() => import('./verticals/billing-invoicing/pages/InvoiceForm').then((m) => ({ default: m.InvoiceForm })));

const PayrollDashboard = React.lazy(() => import('./verticals/payroll-processing/pages/PayrollDashboard').then((m) => ({ default: m.PayrollDashboard })));
const PayRunList = React.lazy(() => import('./verticals/payroll-processing/pages/PayRunList').then((m) => ({ default: m.PayRunList })));
const PayRunDetail = React.lazy(() => import('./verticals/payroll-processing/pages/PayRunDetail').then((m) => ({ default: m.PayRunDetail })));
const PayrollReports = React.lazy(() => import('./verticals/payroll-processing/pages/PayrollReports').then((m) => ({ default: m.PayrollReports })));
const CaregiverPayStubs = React.lazy(() => import('./verticals/payroll-processing/pages/CaregiverPayStubs').then((m) => ({ default: m.CaregiverPayStubs })));
const PayStubList = React.lazy(() => import('./verticals/payroll-processing/pages/PayStubList').then((m) => ({ default: m.PayStubList })));
const PayStubDetail = React.lazy(() => import('./verticals/payroll-processing/pages/PayStubDetail').then((m) => ({ default: m.PayStubDetail })));
const PayPeriodManagement = React.lazy(() => import('./verticals/payroll-processing/pages/PayPeriodManagement').then((m) => ({ default: m.PayPeriodManagement })));

const OpenShiftList = React.lazy(() => import('./verticals/shift-matching/pages/OpenShiftList').then((m) => ({ default: m.OpenShiftList })));
const OpenShiftDetail = React.lazy(() => import('./verticals/shift-matching/pages/OpenShiftDetail').then((m) => ({ default: m.OpenShiftDetail })));
const MatchAnalyticsDashboard = React.lazy(() => import('./verticals/shift-matching/pages/MatchAnalyticsDashboard').then((m) => ({ default: m.MatchAnalyticsDashboard })));

const VisitList = React.lazy(() => import('./verticals/scheduling-visits/pages/VisitList').then((m) => ({ default: m.VisitList })));
const CalendarView = React.lazy(() => import('./verticals/scheduling-visits/pages/CalendarView').then((m) => ({ default: m.CalendarView })));
const ScheduleBuilderPage = React.lazy(() => import('./pages/scheduling/ScheduleBuilderPage'));
const VisitDetailPage = React.lazy(() => import('./pages/scheduling/VisitDetailPage').then((m) => ({ default: m.VisitDetailPage })));


const CaregiverList = React.lazy(() => import('./verticals/caregivers/pages/CaregiverList').then((m) => ({ default: m.CaregiverList })));
const CreateCaregiverPage = React.lazy(() => import('./verticals/caregivers/pages/CreateCaregiverPage').then((m) => ({ default: m.CreateCaregiverPage })));
const CaregiverDetail = React.lazy(() => import('./verticals/caregivers/pages/CaregiverDetail').then((m) => ({ default: m.CaregiverDetail })));

const MedicationListPage = React.lazy(() => import('./pages/medications/MedicationListPage').then((m) => ({ default: m.MedicationListPage })));
const IncidentListPage = React.lazy(() => import('./pages/incidents/IncidentListPage').then((m) => ({ default: m.IncidentListPage })));
const CreateIncidentPage = React.lazy(() => import('./pages/incidents/CreateIncidentPage').then((m) => ({ default: m.CreateIncidentPage })));
const BulkNotificationsPage = React.lazy(() => import('./pages/coordinators/BulkNotificationsPage'));
const ClientIntakeWorkflow = React.lazy(() => import('./pages/clients/ClientIntakeWorkflow'));
const CaregiverTrainingDashboard = React.lazy(() => import('./pages/caregivers/CaregiverTrainingDashboard'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false, // Prevent aggressive refetching
      retry: (failureCount, error) => {
        // Don't retry on 429 (rate limit) or 4xx client errors
        const status = (error as any)?.response?.status;
        if (status === 429 || (status >= 400 && status < 500)) {
          return false;
        }
        // Retry once for 5xx server errors or network issues
        return failureCount < 1;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff, max 30s
    },
  },
});



function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  const { isOpen, closeSearch } = useGlobalSearch();

  return (
    <>
      {isAuthenticated && <GlobalSearch isOpen={isOpen} onClose={closeSearch} />}
      <React.Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[400px]">
            <LoadingSpinner size="lg" />
          </div>
        }
      >
        <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <Signup />
          </PublicRoute>
        }
      />
      <Route
        path="/accept-invite/:token"
        element={
          <PublicRoute>
            <AcceptInvite />
          </PublicRoute>
        }
      />
      <Route
        path="/logout"
        element={<Logout />}
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <AppShell>
              <Onboarding />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          !isAuthenticated ? (
            <Navigate to="/login" replace />
          ) : user?.roles.includes('FAMILY') || user?.roles.includes('CLIENT') ? (
            <Navigate to="/family-portal" replace />
          ) : (
            <ProtectedRoute>
              <AppShell>
                <DashboardSelector />
              </AppShell>
            </ProtectedRoute>
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppShell>
              <Dashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/visits"
        element={
          <ProtectedRoute>
            <AppShell>
              <VisitList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute permission="clients:read">
            <AppShell>
              <ClientList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/intake"
        element={
          <ProtectedRoute
            requiredRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ADMIN', 'COORDINATOR']}
          >
            <AppShell>
              <ClientIntakeWorkflow />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/dashboard"
        element={
          <ProtectedRoute>
            <AppShell>
              <ClientDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/nurse/dashboard"
        element={
          <ProtectedRoute requiredRoles={['NURSE', 'NURSE_RN', 'NURSE_LPN', 'CLINICAL']}>
            <AppShell>
              <NurseDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <ClientDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/new/intake"
        element={
          <ProtectedRoute permission="clients:write">
            <AppShell>
              <ClientIntakeWorkflow />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:clientId/medications"
        element={
          <ProtectedRoute>
            <AppShell>
              <MedicationListPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/incidents"
        element={
          <ProtectedRoute>
            <AppShell>
              <IncidentListPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/incidents/new"
        element={
          <ProtectedRoute>
            <AppShell>
              <CreateIncidentPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregivers"
        element={
          <ProtectedRoute permission="caregivers:read">
            <AppShell>
              <CaregiverList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregivers/new"
        element={
          <ProtectedRoute permission="caregivers:write">
            <AppShell>
              <CreateCaregiverPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregivers/:id"
        element={
          <ProtectedRoute permission="caregivers:read">
            <AppShell>
              <CaregiverDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregivers/:id/training"
        element={
          <ProtectedRoute>
            <AppShell>
              <CaregiverTrainingDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduling"
        element={
          <ProtectedRoute>
            <AppShell>
              <VisitList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduling/calendar"
        element={
          <ProtectedRoute>
            <AppShell>
              <CalendarView />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduling/builder"
        element={
          <ProtectedRoute>
            <AppShell>
              <ScheduleBuilderPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduling/visits/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <VisitDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/visits/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <VisitDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/shift-matching"

        element={
          <ProtectedRoute>
            <AppShell>
              <OpenShiftList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/shift-matching/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <OpenShiftDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/shift-matching/analytics"
        element={
          <ProtectedRoute>
            <AppShell>
              <MatchAnalyticsDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/care-plans"
        element={
          <ProtectedRoute>
            <AppShell>
              <CarePlanList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/care-plans/new"
        element={
          <ProtectedRoute>
            <AppShell>
              <CreateCarePlanPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/care-plans/from-template"
        element={
          <ProtectedRoute>
            <AppShell>
              <CreateFromTemplatePage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/care-plans/from-template/:templateId"
        element={
          <ProtectedRoute>
            <AppShell>
              <CustomizeTemplatePage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/care-plans/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <CarePlanDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/care-plans/:id/edit"
        element={
          <ProtectedRoute>
            <AppShell>
              <EditCarePlanPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/care-plans/:id/progress-notes"
        element={
          <ProtectedRoute>
            <AppShell>
              <ProgressNotesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute permission="tasks:read">
            <AppShell>
              <TaskList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregiver/tasks"
        element={
          <ProtectedRoute>
            <AppShell>
              <CaregiverTasksPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/caregiver/dashboard"
        element={
          <ProtectedRoute requiredRoles={['CAREGIVER']}>
            <AppShell>
              <CaregiverDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks/:id"
        element={
          <ProtectedRoute permission="tasks:read">
            <AppShell>
              <TaskDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/time-tracking"
        element={
          <ProtectedRoute>
            <AppShell>
              <EVVRecordList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/time-tracking/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <EVVRecordDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/time-tracking/aggregator-submissions"
        element={
          <ProtectedRoute
            requiredRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ADMIN', 'COORDINATOR']}
          >
            <AppShell>
              <SubmissionTrackingDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute permission="billing:read">
            <AppShell>
              <InvoiceList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing/new"
        element={
          <ProtectedRoute permission="billing:write">
            <AppShell>
              <InvoiceForm />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <InvoiceDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing/:id/edit"
        element={
          <ProtectedRoute permission="billing:write">
            <AppShell>
              <InvoiceForm />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll"
        element={
          <ProtectedRoute>
            <AppShell>
              <PayrollDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll/runs"
        element={
          <ProtectedRoute>
            <AppShell>
              <PayRunList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll/runs/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <PayRunDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll/reports"
        element={
          <ProtectedRoute>
            <AppShell>
              <PayrollReports />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll/pay-stubs"
        element={
          <ProtectedRoute>
            <AppShell>
              <PayStubList />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll/pay-stubs/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <PayStubDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll/caregivers/:caregiverId/pay-stubs"
        element={
          <ProtectedRoute>
            <AppShell>
              <CaregiverPayStubs />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll/pay-periods"
        element={
          <ProtectedRoute>
            <AppShell>
              <PayPeriodManagement />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute
            requiredRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ADMIN']}
          >
            <AppShell>
              <AdministratorDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/mobile-demo"
        element={
          <ProtectedRoute>
            <AppShell>
              <MobileDemoPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics/admin"
        element={
          <ProtectedRoute
            requiredRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ADMIN']}
          >
            <AppShell>
              <AnalyticsAdminDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics/coordinator"
        element={
          <ProtectedRoute
            requiredRoles={['COORDINATOR', 'SUPER_ADMIN', 'ORG_ADMIN']}
          >
            <AppShell>
              <CoordinatorDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics/reports"
        element={
          <ProtectedRoute>
            <AppShell>
              <ReportsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quality-assurance"
        element={
          <ProtectedRoute permission="audits:view">
            <AppShell>
              <QADashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quality-assurance/audits"
        element={
          <ProtectedRoute>
            <AppShell>
              <AuditsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quality-assurance/audits/new"
        element={
          <ProtectedRoute permission="audits:create">
            <AppShell>
              <CreateAuditPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quality-assurance/audits/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <AuditDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quality-assurance/corrective-actions"
        element={
          <ProtectedRoute>
            <AppShell>
              <CorrectiveActionsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/compliance"
        element={
          <ProtectedRoute
            requiredRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ADMIN', 'COORDINATOR']}
          >
            <AppShell>
              <ComplianceDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinators/notifications"
        element={
          <ProtectedRoute
            requiredRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ADMIN', 'COORDINATOR']}
          >
            <AppShell>
              <BulkNotificationsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Settings />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <ProtectedRoute>
            <AppShell>
              <StaffMessagesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages/:threadId"
        element={
          <ProtectedRoute>
            <AppShell>
              <StaffMessagesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      {/* Family Portal Routes */}
      <Route
        path="/family-portal"
        element={
          <FamilyProtectedRoute>
            <FamilyPortalLayout />
          </FamilyProtectedRoute>
        }
      >
        <Route index element={<FamilyDashboard />} />
        <Route path="settings" element={<FamilySettings />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:threadId" element={<MessagesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="care-plan" element={<CarePlanPage />} />
        <Route path="health-updates" element={<HealthUpdatesPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </React.Suspense>
    </>
  );
}

function App() {
  // Initialize auth storage checks (demo mode: detect stale data from DB resets)
  React.useEffect(() => {
    initAuthStorage();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DemoModeBar />
        <AppRoutes />
        <Toaster position="top-right" />
      </BrowserRouter>
      <Analytics />
      <SpeedInsights />
    </QueryClientProvider>
  );
}

export default App;
