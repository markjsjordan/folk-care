/**
 * API Routes Setup
 * 
 * Integrates all vertical route handlers with the Express app
 */

import { Express, Router } from 'express';
import { Database, PermissionService, UserRepository, AuthMiddleware, AuditService as CoreAuditService } from '@folkcare/core';
import { createClientRouter, ClientService, ClientRepository, ClientAuditService } from '@folkcare/client-demographics';
import { CarePlanService, CarePlanRepository } from '@folkcare/care-plans-tasks';
import { TemplateService } from '@folkcare/care-plans-tasks';
import { createCarePlanHandlers } from '@folkcare/care-plans-tasks';
import { createTaskPrioritizationRoutes, createNaturalLanguageCarePlanRoutes, createCarePlanEffectivenessRoutes } from '@folkcare/care-plans-tasks';
import { createOptimalVisitFrequencyRoutes } from '@folkcare/scheduling-visits';
import { createTrainingRecommendationRoutes } from '@folkcare/caregiver-staff';
import { createBurnoutRoutes } from '@folkcare/caregiver-burnout-prediction';
import { createAIRoutes } from '@folkcare/ai-services';
import { createHealthRouter } from './health';
import { createMetricsRouter } from './metrics';
import { createAuthRouter } from './auth';
import webhooksRouter from './webhooks.js';
import { createUsersRouter } from './users';
import { createOrganizationRouter } from './organizations';
import { createOnboardingRouter } from './onboarding';
import { createCaregiverRouter } from './caregivers';
import { createDemoRouter } from './demo';
import { createAnalyticsRouter } from './analytics';
import { 
  authLimiter, 
  generalApiLimiter, 
  syncLimiter, 
  reportLimiter,
  evvLimiter 
} from '../middleware/rate-limit';
import { createSyncRouter } from '../api/sync/sync-routes';
import docsRoutes from './docs.routes';
import { createPayrollRouter } from './payroll';
import adminRoutes from './admin';
import { createWhiteLabelRouter } from './white-label';
import { AuditService, AuditRepository, AuditFindingRepository, CorrectiveActionRepository, createAuditRoutes } from '@folkcare/quality-assurance-audits';
import { createSearchRouter } from './search.js';
import { MedicationService, createMedicationHandlers } from '@folkcare/medication-management';
import { IncidentService, createIncidentHandlers } from '@folkcare/incident-reporting';
import {
  FamilyEngagementService,
  createFamilyEngagementHandlers,
  FamilyMemberRepository,
  NotificationRepository,
  ActivityFeedRepository,
  MessageRepository
} from '@folkcare/family-engagement';
import { createVisitRouter } from './visits.js';
import pushNotificationRouter from './push-notifications.js';
import { createEVVRouter } from './evv.js';
import { createUsageRouter } from './usage.js';
import { createVerificationRouter } from './verification.js';
import { createImportRoutes } from './import-routes.js';
import { createBillingRouter } from './billing.js';
import { createShiftMatchingRouter } from './shift-matching.js';
import { createComplianceRouter } from './compliance.js';
import exportRouter from './export.js';
import { createAIUsageRouter } from './ai-usage.js';
import { createServiceTypesRouter } from './service-types.js';
import { createVisitNotesRouter } from './visit-notes.js';

/**
 * Helper to create router from care plan handlers object
 */
function createCarePlanRouter(handlers: ReturnType<typeof createCarePlanHandlers>, db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);

  // All care plan routes require authentication
  router.use(authMiddleware.requireAuth);

  // Care Plan endpoints
  router.post('/care-plans', handlers.createCarePlan);
  router.get('/care-plans', handlers.searchCarePlans);
  router.get('/care-plans/:id', handlers.getCarePlanById);
  router.put('/care-plans/:id', handlers.updateCarePlan);
  router.delete('/care-plans/:id', handlers.deleteCarePlan);
  router.post('/care-plans/:id/activate', handlers.activateCarePlan);
  router.get('/care-plans/expiring', handlers.getExpiringCarePlans);
  router.post('/care-plans/:id/version', handlers.createCarePlanVersion);
  router.get('/care-plans/:id/versions', handlers.getCarePlanVersions);

  // Client-specific care plan endpoints
  router.get('/clients/:clientId/care-plans', handlers.getCarePlansByClientId);
  router.get('/clients/:clientId/care-plans/active', handlers.getActiveCarePlanForClient);

  // Task generation
  router.post('/care-plans/:id/tasks/generate', handlers.createTasksForVisit);

  // Create from template
  router.post('/care-plans/from-template', handlers.createCarePlanFromTemplate);

  // Task endpoints
  router.post('/tasks', handlers.createTaskInstance);
  router.get('/tasks', handlers.searchTaskInstances);
  router.get('/tasks/:id', handlers.getTaskInstanceById);
  router.post('/tasks/:id/complete', handlers.completeTask);
  router.post('/tasks/:id/skip', handlers.skipTask);
  router.post('/tasks/:id/report-issue', handlers.reportTaskIssue);

  // Visit tasks
  router.get('/visits/:visitId/tasks', handlers.getTasksByVisitId);

  // Progress notes
  router.post('/progress-notes', handlers.createProgressNote);
  router.get('/care-plans/:id/progress-notes', handlers.getProgressNotesByCarePlanId);

  // Analytics
  router.get('/analytics/care-plans', handlers.getCarePlanAnalytics);
  router.get('/analytics/tasks/completion', handlers.getTaskCompletionMetrics);

  return router;
}

/**
 * Helper to create router from medication handlers object
 */
function createMedicationRouter(handlers: ReturnType<typeof createMedicationHandlers>, db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);

  // All medication routes require authentication
  router.use(authMiddleware.requireAuth);

  // Client medication endpoints
  router.get('/clients/:clientId/medications', handlers.getClientMedications);
  router.get('/clients/:clientId/administrations', handlers.getClientAdministrations);

  // Medication CRUD endpoints
  router.post('/medications', handlers.createMedication);
  router.get('/medications/:medicationId', handlers.getMedication);
  router.patch('/medications/:medicationId', handlers.updateMedication);
  router.post('/medications/:medicationId/discontinue', handlers.discontinueMedication);

  // Medication administration endpoints
  router.post('/medications/:medicationId/administer', handlers.recordAdministration);
  router.get('/medications/:medicationId/administrations', handlers.getMedicationAdministrations);

  // Medication interaction checking endpoint
  router.post('/medications/check-interactions', handlers.checkInteractions);

  return router;
}

/**
 * Helper to create router from incident handlers object
 */
function createIncidentRouter(handlers: ReturnType<typeof createIncidentHandlers>, db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);

  // Public GET endpoints (no authentication required)
  router.get('/incidents', handlers.searchIncidents);
  router.get('/incidents/:incidentId', handlers.getIncident);

  // Protected write endpoints (require authentication)
  router.post('/incidents', authMiddleware.requireAuth, handlers.createIncident);
  router.patch('/incidents/:incidentId', authMiddleware.requireAuth, handlers.updateIncident);

  return router;
}








/**
 * Helper to create router from family engagement handlers object
 */
function createFamilyEngagementRouter(handlers: ReturnType<typeof createFamilyEngagementHandlers>, db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);

  // All family engagement routes require authentication
  router.use(authMiddleware.requireAuth);

  // Family Member Management endpoints
  router.post('/family-engagement/family-members/invite', handlers.inviteFamilyMember);
  router.get('/family-engagement/family-members/:id', handlers.getFamilyMemberProfile);
  router.get('/family-engagement/family-members/client/:clientId', handlers.getFamilyMembersForClient);
  router.patch('/family-engagement/family-members/:id/portal-access', handlers.updatePortalAccess);

  // Notification endpoints
  router.post('/family-engagement/notifications', handlers.sendNotification);
  router.post('/family-engagement/notifications/broadcast', handlers.broadcastNotification);
  router.get('/family-engagement/notifications/family-member/:familyMemberId/unread', handlers.getUnreadNotifications);
  router.patch('/family-engagement/notifications/:id/read', handlers.markNotificationAsRead);

  // Activity Feed endpoints
  router.get('/family-engagement/activity-feed/family-member/:familyMemberId', handlers.getRecentActivity);
  router.post('/family-engagement/activity-feed', handlers.createActivityFeedItem);

  // Messaging endpoints
// Removed undefined staff inbox and thread update routes
  router.post('/family-engagement/messages/threads', handlers.createMessageThread);
  router.post('/family-engagement/messages/threads/:threadId/messages', handlers.sendMessage);
  router.get('/family-engagement/messages/family-member/:familyMemberId/threads', handlers.getThreadsForFamilyMember);
  router.get('/family-engagement/messages/threads/:threadId/messages', handlers.getMessagesInThread);

  // Dashboard endpoint
  router.get('/family-engagement/dashboard/family-member/:familyMemberId', handlers.getFamilyDashboard);

  // Care Event Notification endpoint
  router.post('/family-engagement/events/notify', handlers.notifyFamilyOfCareEvent);

  return router;
}

/**
 * Setup all API routes for the application
 */
export async function setupRoutes(app: Express, db: Database): Promise<void> {
  console.log('Setting up API routes...');

  // Health check route (no authentication required)
  const healthRouter = createHealthRouter(db);
  app.use('/health', healthRouter);
  console.log('  ✓ Health check route registered');

  // Webhooks route (no authentication required, external services)
  app.use('/webhooks', webhooksRouter);
  console.log('  ✓ Webhooks route registered');

  // Metrics route (no authentication required)
  const metricsRouter = createMetricsRouter();
  app.use('/metrics', metricsRouter);
  console.log('  ✓ Metrics route registered');

  // API Documentation routes
  app.use('/', docsRoutes);
  console.log('  ✓ API Documentation routes registered');

  // Authentication routes with rate limiting
  const authRouter = createAuthRouter(db);
  app.use('/api/auth', authLimiter, authRouter);
  console.log('  ✓ Authentication routes registered (with rate limiting)');

  // User Management routes
  const usersRouter = createUsersRouter(db);
  app.use('/api/users', generalApiLimiter, usersRouter);
  console.log('  ✓ User Management routes registered (with rate limiting)');

  // Organization & Invitation routes
  const organizationRouter = createOrganizationRouter(db);
  app.use('/api', generalApiLimiter, organizationRouter);
  console.log('  ✓ Organization & Invitation routes registered (with rate limiting)');

  // Onboarding & Go-Live Checklist routes
  const onboardingRouter = createOnboardingRouter(db);
  app.use('/api/onboarding', generalApiLimiter, onboardingRouter);
  console.log('  ✓ Onboarding routes registered (with rate limiting)');

  // Client Demographics routes
  const clientRepository = new ClientRepository(db);
  // FC-AUDIT-CLIENTS: ClientService was previously constructed with no
  // ClientAuditService, so getClientById's HIPAA access-audit write was always a
  // silent no-op in production (the write path checks `if (this.auditService)`).
  // `db` here already exposes the raw .query(sql, params) method ClientAuditService
  // needs (same object used directly via db.query(...) elsewhere, e.g.
  // security-monitoring.service.ts / routes/sync.ts).
  const clientAuditService = new ClientAuditService(db);
  const clientService = new ClientService(clientRepository, clientAuditService);
  const clientRouter = createClientRouter(clientService, db);
  app.use('/api', generalApiLimiter, clientRouter);
  console.log('  ✓ Client Demographics routes registered (with rate limiting)');

  // Care Plans & Tasks routes
  const carePlanRepository = new CarePlanRepository(db);
  const permissionService = new PermissionService();
  const userRepository = new UserRepository(db);
  const carePlanService = new CarePlanService(carePlanRepository, permissionService, userRepository);
  const templateService = new TemplateService(carePlanRepository);
  const carePlanHandlers = createCarePlanHandlers(carePlanService, templateService);
  const carePlanRouter = createCarePlanRouter(carePlanHandlers, db);
  app.use('/api', generalApiLimiter, carePlanRouter);
  console.log('  ✓ Care Plans & Tasks routes registered (with rate limiting)');

  // Task Prioritization routes (AI-powered)
  const taskPrioritizationRouter = createTaskPrioritizationRoutes(db);
  app.use('/api', generalApiLimiter, taskPrioritizationRouter);
  console.log('  ✓ Task Prioritization routes registered (with rate limiting)');

  // Natural Language Care Plan routes (AI-powered)
  const naturalLanguageCarePlanRouter = createNaturalLanguageCarePlanRoutes(db);
  app.use('/api', generalApiLimiter, naturalLanguageCarePlanRouter);
  console.log('  ✓ Natural Language Care Plan routes registered (with rate limiting)');

  // Care Plan Effectiveness Scoring routes (AI-powered)
  const carePlanEffectivenessRouter = createCarePlanEffectivenessRoutes(db);
  app.use('/api', generalApiLimiter, carePlanEffectivenessRouter);
  console.log('  ✓ Care Plan Effectiveness routes registered (with rate limiting)');

  // Caregiver & Staff Management routes
  const caregiverRouter = createCaregiverRouter(db);
  app.use('/api/caregivers', generalApiLimiter, caregiverRouter);
  console.log('  ✓ Caregiver & Staff Management routes registered (with rate limiting)');

  // Training Recommendations routes (AI-powered)
  const trainingRecommendationRouter = createTrainingRecommendationRoutes(db);
  app.use('/api/caregivers', generalApiLimiter, trainingRecommendationRouter);
  console.log('  ✓ Training Recommendations routes registered (with rate limiting)');

  // Visit & Scheduling routes
  const visitRouter = createVisitRouter(db);
  app.use('/api/visits', generalApiLimiter, visitRouter);
  console.log('  ✓ Visit & Scheduling routes registered (with rate limiting)');

  // Optimal Visit Frequency routes (AI-powered)
  const optimalFrequencyRouter = createOptimalVisitFrequencyRoutes(db);
  app.use('/api', generalApiLimiter, optimalFrequencyRouter);
  console.log('  ✓ Optimal Visit Frequency routes registered (with rate limiting)');

  // Shift Matching & Assignment routes
  const shiftMatchingRouter = createShiftMatchingRouter(db);
  app.use('/api/shift-matching', generalApiLimiter, shiftMatchingRouter);
  console.log('  ✓ Shift Matching & Assignment routes registered (with rate limiting)');

  // Demo routes (interactive demo system) - includes EVV clock-in/out
  const demoRouter = createDemoRouter(db);
  app.use('/api/demo', evvLimiter, demoRouter);
  console.log('  ✓ Demo routes registered (with EVV rate limiting)');

  // Analytics & Reporting routes
  const analyticsRouter = createAnalyticsRouter(db);
  app.use('/api/analytics', reportLimiter, analyticsRouter);
  console.log('  ✓ Analytics & Reporting routes registered (with rate limiting)');

  // Offline Sync routes
  const syncRouter = createSyncRouter(db);
  app.use('/api/sync', syncLimiter, syncRouter);
  console.log('  ✓ Offline Sync routes registered (with rate limiting)');

  // Payroll Processing routes
  const payrollRouter = createPayrollRouter(db);
  app.use('/api', generalApiLimiter, payrollRouter);
  console.log('  ✓ Payroll Processing routes registered (with rate limiting)');

  // Admin routes (cache monitoring, etc.)
  app.use('/api/admin', generalApiLimiter, adminRoutes);
  console.log('  ✓ Admin routes registered (with rate limiting)');

  // White-label routes (branding, feature flags)
  const whiteLabelRouter = createWhiteLabelRouter(db);
  app.use('/api/white-label', generalApiLimiter, whiteLabelRouter);
  console.log('  ✓ White-label routes registered (with rate limiting)');

  // Quality Assurance & Audits routes
  const auditRepository = new AuditRepository(db);
  const auditFindingRepository = new AuditFindingRepository(db);
  const correctiveActionRepository = new CorrectiveActionRepository(db);
  const auditService = new AuditService(
    auditRepository,
    auditFindingRepository,
    correctiveActionRepository,
    permissionService
  );
  const auditRouter = Router();
  createAuditRoutes(auditService, auditRouter, db);
  app.use('/api', generalApiLimiter, auditRouter);
  console.log('  ✓ Quality Assurance & Audits routes registered (with rate limiting)');

  // Global Search routes
  const searchRouter = createSearchRouter(db);
  app.use('/api/search', generalApiLimiter, searchRouter);
  console.log('  ✓ Global Search routes registered (with rate limiting)');

  // Medication Management routes
  const medicationService = new MedicationService(db);
  const medicationHandlers = createMedicationHandlers(medicationService);
  const medicationRouter = createMedicationRouter(medicationHandlers, db);
  app.use('/api', generalApiLimiter, medicationRouter);
  console.log('  ✓ Medication Management routes registered (with rate limiting)');

  // Incident Reporting routes
  const incidentService = new IncidentService(db);
  const incidentHandlers = createIncidentHandlers(incidentService);
  const incidentRouter = createIncidentRouter(incidentHandlers, db);
  app.use('/api', generalApiLimiter, incidentRouter);
  console.log('  ✓ Incident Reporting routes registered (with rate limiting)');

  // Caregiver Burnout Prediction routes
  const burnoutRouter = Router();
  const authMiddleware2 = new AuthMiddleware(db);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  burnoutRouter.use(authMiddleware2.requireAuth as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createBurnoutRoutes(burnoutRouter as any, db);
  app.use('/api', generalApiLimiter, burnoutRouter);
  console.log('  ✓ Caregiver Burnout Prediction routes registered (with rate limiting)');

  // Family Engagement routes
  const familyMemberRepo = new FamilyMemberRepository(db);
  const notificationRepo = new NotificationRepository(db);
  const activityFeedRepo = new ActivityFeedRepository(db);
  const messageRepo = new MessageRepository(db);
  const familyEngagementService = new FamilyEngagementService(
    familyMemberRepo,
    notificationRepo,
    activityFeedRepo,
    messageRepo,
    permissionService,
    userRepository,
    clientService,
    carePlanService,
    new CoreAuditService(db)
  );
  const familyEngagementHandlers = createFamilyEngagementHandlers(familyEngagementService);
  const familyEngagementRouter = createFamilyEngagementRouter(familyEngagementHandlers, db);
  app.use('/api', generalApiLimiter, familyEngagementRouter);
  console.log('  ✓ Family Engagement routes registered (with rate limiting)');

  // Push Notifications routes (for mobile device token registration)
  app.use('/api/push', generalApiLimiter, pushNotificationRouter);
  console.log('  ✓ Push Notifications routes registered (with rate limiting)');

  // EVV & Time Tracking routes
  const evvRouter = createEVVRouter(db);
  app.use('/api/evv', evvLimiter, evvRouter);
  // Alias for backwards compatibility with frontend
  app.use('/api/time-tracking', evvLimiter, evvRouter);
  console.log('  ✓ EVV & Time Tracking routes registered (with rate limiting)');

  // Usage Statistics routes
  const usageRouter = createUsageRouter(db);
  app.use('/api', generalApiLimiter, usageRouter);
  console.log('  ✓ Usage Statistics routes registered (with rate limiting)');

  // Email Verification routes (no auth required for verification)
  const verificationRouter = createVerificationRouter(db);
  app.use('/api', generalApiLimiter, verificationRouter);
  console.log('  ✓ Email Verification routes registered (with rate limiting)');

  // Import & Data Migration routes
  const importRouter = createImportRoutes(db);
  app.use('/api/import', generalApiLimiter, importRouter);
  console.log('  ✓ Import & Data Migration routes registered (with rate limiting)');

  // Billing & Invoicing routes
  const billingRouter = createBillingRouter(db);
  app.use('/api/billing', generalApiLimiter, billingRouter);
  console.log('  ✓ Billing & Invoicing routes registered (with rate limiting)');

  // Compliance Autopilot routes
  const complianceRouter = createComplianceRouter(db);
  app.use('/api/compliance', generalApiLimiter, complianceRouter);
  console.log('  ✓ Compliance Autopilot routes registered (with rate limiting)');

  // Data Export routes
  app.use('/api/export', generalApiLimiter, exportRouter);
  console.log('  ✓ Data Export routes registered (with rate limiting)');

  // AI Services routes (note summarization, sentiment analysis)
  const aiRouter = createAIRoutes(db);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use('/api', generalApiLimiter, aiRouter as any);
  console.log('  ✓ AI Services routes registered (with rate limiting)');

  // AI Usage tracking routes
  const aiUsageRouter = createAIUsageRouter(db);
  app.use('/api', generalApiLimiter, aiUsageRouter);
  console.log('  ✓ AI Usage tracking routes registered (with rate limiting)');

  // Service Types routes (standard home care taxonomy & state billing codes)
  const serviceTypesRouter = createServiceTypesRouter(db);
  app.use('/api/service-types', generalApiLimiter, serviceTypesRouter);
  console.log('  ✓ Service Types routes registered (with rate limiting)');

  // Visit Notes routes (AI autofill suggestions)
  const visitNotesRouter = createVisitNotesRouter(db);
  app.use('/api/visit-notes', generalApiLimiter, visitNotesRouter);
  console.log('  ✓ Visit Notes routes registered (with rate limiting)');

  console.log('API routes setup complete\n');
}
