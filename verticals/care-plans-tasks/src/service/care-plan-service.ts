/**
 * Care Plan Service
 * 
 * Business logic for care plans and tasks management
 */

import { UserContext, PaginationParams, PaginatedResult, UUID, NotFoundError, ValidationError, PermissionError } from '@folkcare/core';
import { PermissionService } from '@folkcare/core';
import { addDays, isBefore } from 'date-fns';
import {
  CarePlan,
  CreateCarePlanInput,
  UpdateCarePlanInput,
  CarePlanSearchFilters,
  TaskInstance,
  CreateTaskInstanceInput,
  CompleteTaskInput,
  TaskInstanceSearchFilters,
  ProgressNote,
  CreateProgressNoteInput,
  CarePlanStatus,
  CarePlanAnalytics,
  TaskCompletionMetrics,
  TaskTemplate,
  TaskCategory,
} from '../types/care-plan';
import { CarePlanRepository } from '../repository/care-plan-repository';
import { CarePlanValidator } from '../validation/care-plan-validator';
import { IUserRepository } from '@folkcare/core';
import { StateComplianceValidator } from '../validation/state-compliance-validator';
import { StateSpecificCarePlanData } from '../types/state-specific';
import { CarePlanVersionRepository } from '../repository/care-plan-version-repository.js';
import {
  CarePlanVersion,
  CarePlanVersionDiff,
  ClinicalReviewInput,
  Queryable,
} from '../types/care-plan-versioning.js';

export class CarePlanService {
  private repository: CarePlanRepository;
  private permissions: PermissionService;
  private userRepository: IUserRepository;
  private versionRepository?: CarePlanVersionRepository;

  constructor(
    repository: CarePlanRepository,
    permissions: PermissionService,
    userRepository: IUserRepository,
    versionRepository?: CarePlanVersionRepository
  ) {
    this.repository = repository;
    this.permissions = permissions;
    this.userRepository = userRepository;
    if (versionRepository) {
      this.versionRepository = versionRepository;
    } else if (repository && typeof (repository as any).getDatabase === 'function') {
      const db = (repository as any).getDatabase();
      if (db) {
        this.versionRepository = new CarePlanVersionRepository(db);
      }
    }
  }

  /**
   * Run `work` in one database transaction so a plan change and its audit
   * snapshot commit or roll back together. Without a database handle (unit
   * tests with mocked repositories) it runs without a transaction.
   */
  private async inTransaction<T>(work: (executor?: Queryable) => Promise<T>): Promise<T> {
    const db = this.repository.getDatabase?.();
    if (db && typeof db.transaction === 'function') {
      return db.transaction((client) => work(client));
    }
    return work();
  }

  /**
   * Create a new care plan
   */
  async createCarePlan(
    input: CreateCarePlanInput & Partial<StateSpecificCarePlanData>,
    context: UserContext
  ): Promise<CarePlan> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:create')) {
      throw new PermissionError('Insufficient permissions to create care plans');
    }

    // State compliance validation for TX/FL
    if (input.stateJurisdiction && ['TX', 'FL'].includes(input.stateJurisdiction)) {
      const validation = StateComplianceValidator.validateCarePlanCompliance(
        input as CarePlan & Partial<StateSpecificCarePlanData>,
        input.stateJurisdiction
      );
      
      const blockingErrors = validation.errors.filter(e => e.severity === 'BLOCKING');
      if (blockingErrors.length > 0) {
        throw new Error(`Care plan does not meet ${input.stateJurisdiction} requirements: ${
          blockingErrors.map(e => e.message).join('; ')
        }`);
      }
    }

    // Calculate next review due date based on state requirements
    const reviewIntervalDays = input.planReviewIntervalDays || 
      (input.stateJurisdiction === 'TX' ? 60 : input.stateJurisdiction === 'FL' ? 60 : 90);
    
    const nextReviewDue = new Date(input.effectiveDate);
    nextReviewDue.setDate(nextReviewDue.getDate() + reviewIntervalDays);

    // Validate input
    const validatedInput = CarePlanValidator.validateCreateCarePlan(input);

    // Generate plan number
    const planNumber = await this.generatePlanNumber();

    const carePlanData = {
      ...validatedInput,
      planNumber,
      planReviewIntervalDays: reviewIntervalDays,
      nextReviewDue,
      status: 'DRAFT' as const,
    };

    // Create the plan and its v1 audit snapshot atomically
    const carePlan = await this.inTransaction(async (executor) => {
      const created = await this.repository.createCarePlan(
        { ...carePlanData, createdBy: context.userId },
        executor
      );

      if (this.versionRepository) {
        await this.versionRepository.createCarePlanVersion(
          {
            carePlanId: created.id,
            versionNumber: 1,
            status: 'ACTIVE',
            content: created,
            effectiveStart: created.effectiveDate,
            changeReason: 'Initial care plan creation',
            createdBy: context.userId,
          },
          executor
        );
      }

      return created;
    });

    return carePlan;
  }

  /**
   * Get care plan by ID
   */
  async getCarePlanById(
    id: UUID,
    context: UserContext
  ): Promise<CarePlan> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:read')) {
      throw new PermissionError('Insufficient permissions to read care plans');
    }

    const carePlan = await this.repository.getCarePlanById(id);
    if (!carePlan) {
      throw new NotFoundError('Care plan not found', { id });
    }

    // Check organization access
    if (carePlan.organizationId !== context.organizationId) {
      throw new PermissionError('Cannot access care plan from another organization');
    }

    return carePlan;
  }

  /**
   * Update care plan
   */
  async updateCarePlan(
    id: UUID,
    input: UpdateCarePlanInput,
    context: UserContext
  ): Promise<CarePlan> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:update')) {
      throw new PermissionError('Insufficient permissions to update care plans');
    }

    // Validate input
    const validatedInput = CarePlanValidator.validateUpdateCarePlan(input);

    // Get existing care plan
    const existing = await this.getCarePlanById(id, context);

    // Prevent updates to completed/discontinued plans without proper permissions
    if (['COMPLETED', 'DISCONTINUED'].includes(existing.status) &&
      !this.permissions.hasPermission(context, 'care-plans:update:archived')) {
      throw new PermissionError('Cannot update completed or discontinued care plans');
    }

    // Apply the change and record version N+1 atomically (immutable audit history)
    const updated = await this.inTransaction(async (executor) => {
      const plan = await this.repository.updateCarePlan(id, validatedInput, context.userId, executor);

      if (this.versionRepository) {
        const latestVersion = await this.versionRepository.getLatestCarePlanVersion(id, executor);
        const newVersionNumber = (latestVersion?.versionNumber ?? (existing.currentVersion || 1)) + 1;
        const newVersion = await this.versionRepository.createCarePlanVersion(
          {
            carePlanId: id,
            versionNumber: newVersionNumber,
            status: ['COMPLETED', 'DISCONTINUED'].includes(plan.status) ? 'ARCHIVED' : 'ACTIVE',
            content: plan,
            effectiveStart: new Date(),
            changeReason: (input as { changeReason?: string }).changeReason || 'Care plan modified',
            createdBy: context.userId,
          },
          executor
        );

        if (latestVersion) {
          await this.versionRepository.supersedeVersion(latestVersion.id, newVersion.id, new Date(), executor);
        }

        plan.currentVersion = newVersionNumber;
      }

      return plan;
    });

    return updated;
  }

  /**
   * Activate a care plan
   */
  async activateCarePlan(
    id: UUID,
    context: UserContext
  ): Promise<CarePlan> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:activate')) {
      throw new PermissionError('Insufficient permissions to activate care plans');
    }

    const carePlan = await this.getCarePlanById(id, context);

    // State compliance check before activation
    const carePlanWithState = carePlan as CarePlan & Partial<StateSpecificCarePlanData>;
    if (carePlanWithState.stateJurisdiction && 
        ['TX', 'FL'].includes(carePlanWithState.stateJurisdiction)) {
      const validation = StateComplianceValidator.validateCarePlanCompliance(
        carePlanWithState,
        carePlanWithState.stateJurisdiction
      );
      
      const blockingErrors = validation.errors.filter(e => e.severity === 'BLOCKING');
      if (blockingErrors.length > 0) {
        throw new Error(`Cannot activate: ${blockingErrors.map(e => e.message).join('; ')}`);
      }
    }

    // Validate plan is ready for activation
    const validation = CarePlanValidator.validateCarePlanActivation(carePlan);
    if (!validation.valid) {
      throw new ValidationError('Care plan cannot be activated', {
        errors: validation.errors,
      });
    }

    // Check for existing active plan
    const existingActive = await this.repository.getActiveCarePlanForClient(
      carePlan.clientId
    );

    if (existingActive && existingActive.id !== id) {
      // Optionally expire the old plan
      await this.repository.updateCarePlan(
        existingActive.id,
        { status: 'EXPIRED' as CarePlanStatus },
        context.userId,
      );
    }

    return await this.repository.updateCarePlan(
      id,
      { status: 'ACTIVE' as CarePlanStatus },
      context.userId,
    );
  }

  /**
   * Search care plans
   */
  async searchCarePlans(
    filters: CarePlanSearchFilters,
    pagination: PaginationParams,
    context: UserContext
  ): Promise<PaginatedResult<CarePlan>> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:read')) {
      throw new PermissionError('Insufficient permissions to search care plans');
    }

    // Validate filters
    const validatedFilters = CarePlanValidator.validateCarePlanSearchFilters(filters);

    // Enforce organization filter
    const orgFilters: CarePlanSearchFilters = {
      ...validatedFilters,
      organizationId: context.organizationId!,
    };

    return await this.repository.searchCarePlans(orgFilters, pagination);
  }

  /**
   * Get care plans for a client
   */
  async getCarePlansByClientId(
    clientId: UUID,
    context: UserContext
  ): Promise<CarePlan[]> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:read')) {
      throw new PermissionError('Insufficient permissions to read care plans');
    }

    const plans = await this.repository.getCarePlansByClientId(clientId);

    // Filter by organization
    return plans.filter(plan => plan.organizationId === context.organizationId);
  }

  /**
   * Get active care plan for a client
   */
  async getActiveCarePlanForClient(
    clientId: UUID,
    context: UserContext
  ): Promise<CarePlan | null> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:read')) {
      throw new PermissionError('Insufficient permissions to read care plans');
    }

    const plan = await this.repository.getActiveCarePlanForClient(clientId);

    // Check organization access
    if (plan && plan.organizationId !== context.organizationId) {
      return null;
    }

    return plan;
  }

  /**
   * Get care plans expiring soon
   */
  async getExpiringCarePlans(
    daysUntilExpiration: number,
    context: UserContext
  ): Promise<CarePlan[]> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:read')) {
      throw new PermissionError('Insufficient permissions to read care plans');
    }

    return await this.repository.getExpiringCarePlans(
      context.organizationId!,
      daysUntilExpiration
    );
  }

  /**
   * Delete care plan (soft delete)
   */
  async deleteCarePlan(
    id: UUID,
    context: UserContext
  ): Promise<void> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'care-plans:delete')) {
      throw new PermissionError('Insufficient permissions to delete care plans');
    }

    const carePlan = await this.getCarePlanById(id, context);

    // Prevent deletion of active plans
    if (carePlan.status === 'ACTIVE') {
      throw new ValidationError('Cannot delete an active care plan. Please discontinue it first.');
    }

    await this.repository.deleteCarePlan(id, context.userId);
  }

  /**
   * Create task instances from templates for a visit
   */
  async createTasksForVisit(
    carePlanId: UUID,
    visitId: UUID,
    visitDate: Date,
    context: UserContext
  ): Promise<TaskInstance[]> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'tasks:create')) {
      throw new PermissionError('Insufficient permissions to create tasks');
    }

    const carePlan = await this.getCarePlanById(carePlanId, context);

    const tasks: TaskInstance[] = [];

    for (const template of carePlan.taskTemplates || []) {
      if (template.status !== 'ACTIVE') {
        continue;
      }

      // Check if task should be created based on frequency
      if (this.shouldCreateTaskForDate(template, visitDate)) {
        const task = await this.createTaskInstance({
          carePlanId,
          templateId: template.id,
          visitId,
          clientId: carePlan.clientId,
          name: template.name,
          description: template.description,
          category: template.category,
          instructions: template.instructions,
          scheduledDate: visitDate,
          requiredSignature: template.requiresSignature,
          requiredNote: template.requiresNote,
        }, context);

        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Create a task instance
   */
  async createTaskInstance(
    input: CreateTaskInstanceInput,
    context: UserContext
  ): Promise<TaskInstance> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'tasks:create')) {
      throw new PermissionError('Insufficient permissions to create tasks');
    }

    // Validate input
    const validatedInput = CarePlanValidator.validateCreateTaskInstance(input);

    const task = await this.repository.createTaskInstance({
      ...validatedInput,
      createdBy: context.userId,
      status: 'SCHEDULED',
    });

    return task;
  }

  /**
   * Get task instance by ID
   */
  async getTaskInstanceById(
    id: UUID,
    context: UserContext
  ): Promise<TaskInstance> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'tasks:read')) {
      throw new PermissionError('Insufficient permissions to read tasks');
    }

    const task = await this.repository.getTaskInstanceById(id);
    if (!task) {
      throw new NotFoundError('Task not found', { id });
    }

    // Caregivers can only view tasks assigned to them
    if (context.roles.includes('CAREGIVER') && task.assignedCaregiverId !== context.userId) {
      throw new PermissionError('Cannot access tasks assigned to other caregivers');
    }

    return task;
  }

  /**
   * Complete a task
   */
  async completeTask(
    id: UUID,
    input: CompleteTaskInput,
    context: UserContext
  ): Promise<TaskInstance> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'tasks:complete')) {
      throw new PermissionError('Insufficient permissions to complete tasks');
    }

    const task = await this.getTaskInstanceById(id, context);

    // Validate task can be completed
    if (task.status === 'COMPLETED') {
      throw new ValidationError('Task is already completed');
    }
    if (task.status === 'CANCELLED') {
      throw new ValidationError('Cannot complete a cancelled task');
    }

    // Validate input
    const validatedInput = CarePlanValidator.validateCompleteTask(input);

    // Check requirements
    const validation = CarePlanValidator.validateTaskCompletion(task, validatedInput);
    if (!validation.valid) {
      throw new ValidationError('Task completion requirements not met', {
        errors: validation.errors,
      });
    }

    // Validate vital signs if provided
    if (validatedInput.verificationData?.vitalSigns) {
      const vitalValidation = CarePlanValidator.validateVitalSigns(
        validatedInput.verificationData.vitalSigns
      );
      if (vitalValidation.warnings.length > 0) {
        // Log warnings but don't block completion
        console.warn('Vital signs warnings:', vitalValidation.warnings);
      }
    }

    const now = new Date();

    // Update task
    const updateData: Partial<TaskInstance> = {
      status: 'COMPLETED',
      completedAt: now,
      completedBy: context.userId,
    };
    
    if (validatedInput.completionNote) {
      updateData.completionNote = validatedInput.completionNote;
    }
    
    if (validatedInput.signature) {
      updateData.completionSignature = {
        ...validatedInput.signature,
        signedAt: now,
      };
    }
    
    if (validatedInput.verificationData) {
      const { gpsLocation, ...restVerificationData } = validatedInput.verificationData;
      updateData.verificationData = {
        ...restVerificationData,
        verifiedAt: now,
        verifiedBy: context.userId,
        ...(gpsLocation && {
          gpsLocation: {
            latitude: gpsLocation.latitude,
            longitude: gpsLocation.longitude,
            accuracy: gpsLocation.accuracy,
            timestamp: now,
          },
        }),
      };
    }
    
    if (validatedInput.qualityCheckResponses) {
      updateData.qualityCheckResponses = validatedInput.qualityCheckResponses;
    }
    
    if (validatedInput.customFieldValues) {
      updateData.customFieldValues = validatedInput.customFieldValues;
    }

    const completed = await this.repository.updateTaskInstance(
      id,
      updateData,
      context.userId
    );

    return completed;
  }

  /**
   * Skip a task
   */
  async skipTask(
    id: UUID,
    reason: string,
    note?: string,
    context: UserContext = {} as UserContext
  ): Promise<TaskInstance> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'tasks:skip')) {
      throw new PermissionError('Insufficient permissions to skip tasks');
    }

    const task = await this.getTaskInstanceById(id, context);

    // Validate task can be skipped
    if (task.status === 'COMPLETED') {
      throw new ValidationError('Cannot skip a completed task');
    }
    if (task.status === 'CANCELLED') {
      throw new ValidationError('Cannot skip a cancelled task');
    }

    const updateData: Partial<TaskInstance> = {
      status: 'SKIPPED',
      skippedAt: new Date(),
      skippedBy: context.userId,
      skipReason: reason,
    };

    if (note) {
      updateData.skipNote = note;
    }

    const skipped = await this.repository.updateTaskInstance(
      id,
      updateData,
      context.userId
    );

    return skipped;
  }

  /**
   * Report an issue with a task
   */
  async reportTaskIssue(
    id: UUID,
    issueDescription: string,
    context: UserContext
  ): Promise<TaskInstance> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'tasks:update')) {
      throw new PermissionError('Insufficient permissions to report task issues');
    }

    await this.getTaskInstanceById(id, context);

    const updated = await this.repository.updateTaskInstance(
      id,
      {
        status: 'ISSUE_REPORTED',
        issueReported: true,
        issueDescription,
        issueReportedAt: new Date(),
        issueReportedBy: context.userId,
      },
      context.userId
    );

    return updated;
  }

  /**
   * Search task instances
   */
  async searchTaskInstances(
    filters: TaskInstanceSearchFilters,
    pagination: PaginationParams,
    context: UserContext
  ): Promise<PaginatedResult<TaskInstance>> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'tasks:read')) {
      throw new PermissionError('Insufficient permissions to search tasks');
    }

    // Validate filters
    const validatedFilters = CarePlanValidator.validateTaskInstanceSearchFilters(filters);

    // Auto-filter by caregiver ID if user is a CAREGIVER
    // Caregivers should only see tasks assigned to them
    if (context.roles.includes('CAREGIVER') && !validatedFilters.assignedCaregiverId) {
      validatedFilters.assignedCaregiverId = context.userId;
    }

    // Filter out undefined properties to satisfy exactOptionalPropertyTypes
    const filteredFilters = Object.fromEntries(
      Object.entries(validatedFilters).filter(([_, value]) => value !== undefined)
    );

    return await this.repository.searchTaskInstances(filteredFilters, pagination);
  }

  /**
   * Get tasks for a visit
   */
  async getTasksByVisitId(
    visitId: UUID,
    context: UserContext
  ): Promise<TaskInstance[]> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'tasks:read')) {
      throw new PermissionError('Insufficient permissions to read tasks');
    }

    return await this.repository.getTasksByVisitId(visitId);
  }

  /**
   * Create a progress note
   */
  async createProgressNote(
    input: CreateProgressNoteInput,
    context: UserContext
  ): Promise<ProgressNote> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'progress-notes:create')) {
      throw new PermissionError('Insufficient permissions to create progress notes');
    }

    // Fetch real author name from user repository
    const author = await this.userRepository.getUserById(context.userId);
    if (!author) {
      throw new Error('User not found');
    }

    const authorName = `${author.firstName} ${author.lastName}`;

    // Validate input
    const validatedInput = CarePlanValidator.validateCreateProgressNote(input);

    const now = new Date();

    // If Timestamp is a Date, this is fine.
    // If your Timestamp is an ISO string alias, use: const now = new Date().toISOString() as unknown as Timestamp;

    // Add timestamp to observations
    const observationsWithTimestamp = input.observations?.map(obs => ({
      ...obs,
      timestamp: obs.timestamp || new Date(),
    }));

    const noteData = {
      ...validatedInput,
      authorId: context.userId,
      authorName,
      observations: observationsWithTimestamp,
    };

    const note = await this.repository.createProgressNote({
      ...noteData,
      authorId: context.userId,
      authorName,
      authorRole: String(context.roles?.[0] || 'CAREGIVER'),
      noteDate: now,
    });

    return note;
  }

  /**
   * Get progress notes for a care plan
   */
  async getProgressNotesByCarePlanId(
    carePlanId: UUID,
    context: UserContext
  ): Promise<ProgressNote[]> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'progress-notes:read')) {
      throw new PermissionError('Insufficient permissions to read progress notes');
    }

    return await this.repository.getProgressNotesByCarePlanId(carePlanId);
  }

  /**
   * Get care plan analytics
   */
  async getCarePlanAnalytics(
    organizationId: UUID,
    context: UserContext
  ): Promise<CarePlanAnalytics> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'analytics:read')) {
      throw new PermissionError('Insufficient permissions to view analytics');
    }

    // Get all care plans for organization
    const plans = await this.repository.searchCarePlans(
      { organizationId },
      { page: 1, limit: 10000 }
    );

    const activePlans = plans.items.filter(p => p.status === 'ACTIVE');
    const expiringPlans = plans.items.filter(p =>
      p.expirationDate &&
      isBefore(p.expirationDate, addDays(new Date(), 30))
    );

    // Calculate metrics
    let totalGoals = 0;
    let achievedGoals = 0;

    plans.items.forEach(plan => {
      totalGoals += plan.goals.length;
      achievedGoals += plan.goals.filter(g => g.status === 'ACHIEVED').length;
    });

    // Get task metrics for organization
    const thirtyDaysAgo = addDays(new Date(), -30);
    const taskMetrics = await this.getTaskCompletionMetrics({
      dateFrom: thirtyDaysAgo,
      dateTo: new Date(),
      organizationId,
    }, context);

    // Calculate compliance based on active plans with no expiring credentials
    const compliantPlans = activePlans.filter(p => p.complianceStatus === 'COMPLIANT').length;
    const complianceRate = activePlans.length > 0 ? (compliantPlans / activePlans.length) * 100 : 100;

    return {
      totalPlans: plans.total,
      activePlans: activePlans.length,
      expiringPlans: expiringPlans.length,
      goalCompletionRate: totalGoals > 0 ? (achievedGoals / totalGoals) * 100 : 0,
      taskCompletionRate: taskMetrics.completionRate,
      averageGoalsPerPlan: plans.total > 0 ? totalGoals / plans.total : 0,
      averageTasksPerVisit: taskMetrics.totalTasks > 0 ? taskMetrics.totalTasks / plans.total : 0,
      complianceRate,
    };
  }

  /**
   * Get task completion metrics
   */
  async getTaskCompletionMetrics(
    filters: { dateFrom: Date; dateTo: Date; organizationId: UUID },
    context: UserContext
  ): Promise<TaskCompletionMetrics> {
    // Validate permissions
    if (!this.permissions.hasPermission(context, 'analytics:read')) {
      throw new PermissionError('Insufficient permissions to view analytics');
    }

    const tasks = await this.repository.searchTaskInstances(
      {
        scheduledDateFrom: filters.dateFrom,
        scheduledDateTo: filters.dateTo,
      },
      { page: 1, limit: 10000 }
    );

    const completed = tasks.items.filter(t => t.status === 'COMPLETED');
    const skipped = tasks.items.filter(t => t.status === 'SKIPPED');
    const missed = tasks.items.filter(t => t.status === 'MISSED');
    const issues = tasks.items.filter(t => t.issueReported);

    // Group by category
    const tasksByCategory = tasks.items.reduce((acc, task) => {
      acc[task.category] = (acc[task.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate average completion time
    const completionTimes = completed
      .filter(t => t.completedAt && t.scheduledDate)
      .map(t => {
        const scheduled = new Date(t.scheduledDate).getTime();
        const completed = new Date(t.completedAt!).getTime();
        return (completed - scheduled) / (1000 * 60); // minutes
      });

    const avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;

    return {
      totalTasks: tasks.total,
      completedTasks: completed.length,
      skippedTasks: skipped.length,
      missedTasks: missed.length,
      completionRate: tasks.total > 0 ? (completed.length / tasks.total) * 100 : 0,
      averageCompletionTime: avgCompletionTime,
      tasksByCategory: tasksByCategory as Record<TaskCategory, number>,
      issuesReported: issues.length,
    };
  }

  /**
   * Helper: Generate unique plan number
   */
  private async generatePlanNumber(): Promise<string> {
    const prefix = 'CP';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Helper: Determine if task should be created for a date based on frequency
   */
  private shouldCreateTaskForDate(template: TaskTemplate, date: Date): boolean {
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const frequency = template.frequency;

    if (frequency.pattern === 'DAILY') {
      return true;
    }

    if (frequency.pattern === 'WEEKLY' && frequency.specificDays) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return frequency.specificDays.includes(dayOfWeek as any);
    }

    if (frequency.pattern === 'AS_NEEDED') {
      return false; // Manual creation required
    }

    // Default to creating the task
    return true;
  }

  /**
   * Clone and create version N+1 upon clinical plan review
   * Texas HHSC (26 TAC §558.287) and Florida AHCA (Chapter 59A-8) compliant
   */
  async createPlanReviewVersion(
    id: UUID,
    input: ClinicalReviewInput,
    context: UserContext
  ): Promise<{ version: CarePlanVersion; carePlan: CarePlan }> {
    if (!this.permissions.hasPermission(context, 'care-plans:update')) {
      throw new PermissionError('Insufficient permissions to review and update care plans');
    }

    const existing = await this.getCarePlanById(id, context);
    if (!existing) {
      throw new NotFoundError('Care plan not found', { id });
    }

    // Determine state jurisdiction and compliance interval
    const jurisdiction = input.stateJurisdiction || (existing as any).stateJurisdiction;
    
    // Review intervals:
    // Texas HHSC: 60-day review interval requirement (26 TAC §558.287)
    // Florida AHCA: 60-day for skilled nursing / RN supervisory visits, 90-day for personal care (59A-8.0215)
    let reviewIntervalDays = 60;
    if (jurisdiction === 'FL') {
      const isSkilledOrDelegated =
        existing.planType === 'SKILLED_NURSING' ||
        Boolean((existing as any).rnDelegationId) ||
        existing.interventions?.some((i) =>
          ['MEDICATION_ADMINISTRATION', 'WOUND_CARE', 'VITAL_SIGNS_MONITORING'].includes(i.category)
        );
      reviewIntervalDays = isSkilledOrDelegated ? 60 : 90;
    }

    const reviewDate = input.reviewDate ? new Date(input.reviewDate) : new Date();
    const nextReviewDue = addDays(reviewDate, reviewIntervalDays);

    let updatedPlan!: CarePlan;

    // Signature, plan update, snapshot and supersede commit together or not at all
    const newVersion = await this.inTransaction(async (executor) => {
      let signatureId: UUID | undefined;
      if (input.signature && this.versionRepository) {
        const signature = await this.versionRepository.createSignature(
          {
            signerId: input.signature.signerId,
            signerRole: input.signature.signerRole,
            signatureSvg: input.signature.signatureSvg,
            ipAddress: input.signature.ipAddress,
            signedAt: reviewDate,
          },
          executor
        );
        signatureId = signature.id;
      }

      const latestVersion = this.versionRepository
        ? await this.versionRepository.getLatestCarePlanVersion(id, executor)
        : null;
      const newVersionNumber = (latestVersion?.versionNumber ?? (existing.currentVersion || 1)) + 1;

      if (input.contentOverrides && Object.keys(input.contentOverrides).length > 0) {
        await this.repository.updateCarePlan(
          id,
          input.contentOverrides as UpdateCarePlanInput,
          context.userId,
          executor
        );
      }

      updatedPlan = await this.repository.updatePlanVersionAndReview(
        id,
        newVersionNumber,
        reviewDate,
        nextReviewDue,
        context.userId,
        'ACTIVE',
        executor
      );

      if (!this.versionRepository) {
        return {
          id,
          carePlanId: id,
          versionNumber: newVersionNumber,
          status: 'ACTIVE' as const,
          content: updatedPlan,
          effectiveStart: reviewDate,
          changeReason: input.changeReason,
          signatureId,
          createdAt: new Date(),
          createdBy: context.userId,
        };
      }

      const created = await this.versionRepository.createCarePlanVersion(
        {
          carePlanId: id,
          versionNumber: newVersionNumber,
          status: 'ACTIVE',
          content: updatedPlan,
          effectiveStart: reviewDate,
          changeReason: input.changeReason,
          signatureId,
          createdBy: context.userId,
        },
        executor
      );

      if (latestVersion) {
        await this.versionRepository.supersedeVersion(latestVersion.id, created.id, reviewDate, executor);
      }

      return created;
    });

    return {
      version: newVersion,
      carePlan: updatedPlan,
    };
  }

  /**
   * Get version history with diffs between successive versions
   */
  async getCarePlanVersionHistory(
    id: UUID,
    context: UserContext
  ): Promise<CarePlanVersion[]> {
    if (!this.permissions.hasPermission(context, 'care-plans:read')) {
      throw new PermissionError('Insufficient permissions to read care plans');
    }

    const carePlan = await this.getCarePlanById(id, context);
    if (!carePlan) {
      throw new NotFoundError('Care plan not found', { id });
    }

    if (!this.versionRepository) {
      return [];
    }

    const versions = await this.versionRepository.getCarePlanVersions(id);

    // Compute diffs against previous version
    for (let i = 0; i < versions.length; i++) {
      const currentVersion = versions[i];
      if (!currentVersion) continue;
      if (i > 0) {
        const prevVersion = versions[i - 1];
        if (prevVersion) {
          currentVersion.diffFromPrevious = this.computeCarePlanDiff(
            prevVersion.content,
            currentVersion.content,
            prevVersion.versionNumber,
            currentVersion.versionNumber
          );
        }
      } else {
        currentVersion.diffFromPrevious = null;
      }
    }

    return versions;
  }

  /**
   * Helper: compute diff between care plan versions for audit inspection
   */
  public computeCarePlanDiff(
    prevContent: Record<string, unknown> | CarePlan,
    currContent: Record<string, unknown> | CarePlan,
    prevVersionNumber: number,
    currVersionNumber: number
  ): CarePlanVersionDiff {
    const changedFields: string[] = [];
    const fieldsToCheck = [
      'name',
      'planType',
      'status',
      'priority',
      'effectiveDate',
      'expirationDate',
      'reviewDate',
      'nextReviewDue',
      'coordinatorId',
      'goals',
      'interventions',
      'taskTemplates',
      'notes',
      'serviceFrequency',
    ];

    const prev = prevContent as Record<string, unknown>;
    const curr = currContent as Record<string, unknown>;

    for (const field of fieldsToCheck) {
      if (JSON.stringify(prev[field]) !== JSON.stringify(curr[field])) {
        changedFields.push(field);
      }
    }

    const prevGoals = Array.isArray(prev.goals) ? prev.goals : [];
    const currGoals = Array.isArray(curr.goals) ? curr.goals : [];
    const goalsChanged = JSON.stringify(prevGoals) !== JSON.stringify(currGoals);

    const prevInterventions = Array.isArray(prev.interventions) ? prev.interventions : [];
    const currInterventions = Array.isArray(curr.interventions) ? curr.interventions : [];
    const interventionsChanged =
      JSON.stringify(prevInterventions) !== JSON.stringify(currInterventions);

    const prevTasks = Array.isArray(prev.taskTemplates) ? prev.taskTemplates : [];
    const currTasks = Array.isArray(curr.taskTemplates) ? curr.taskTemplates : [];
    const tasksChanged = JSON.stringify(prevTasks) !== JSON.stringify(currTasks);

    const summary =
      changedFields.length === 0
        ? `Version ${currVersionNumber}: No content modifications`
        : `Version ${currVersionNumber} updated: ${changedFields.join(', ')}`;

    return {
      previousVersion: prevVersionNumber,
      currentVersion: currVersionNumber,
      changedFields,
      goalsChanged,
      interventionsChanged,
      tasksChanged,
      summary,
    };
  }
}

export default CarePlanService;
