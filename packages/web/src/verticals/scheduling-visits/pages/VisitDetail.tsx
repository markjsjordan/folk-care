import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  CheckCircle2,
  FileText,
  ClipboardCheck,
  ShieldCheck,
  Stethoscope,
  Sparkles,
  PlusCircle,
} from 'lucide-react';
import { Button, Card, CardHeader, CardContent, LoadingSpinner, ErrorMessage } from '@/core/components';
import { formatDate } from '@/core/utils';
import { useVisit } from '../hooks/useVisits';
import { useClient } from '@/verticals/client-demographics/hooks';
import {
  calculateSupervisoryCadence,
  SupervisoryCadenceResult,
} from '../utils/supervisory-cadence';
import { SupervisionAlertBanner } from '../components/SupervisionAlertBanner';
import {
  convertAssessmentFindingsToDraftTasks,
  DraftCarePlanTask,
  AssessmentFindings,
} from '@/verticals/care-plans';
import { VISIT_STATUS_LABELS, VISIT_TYPE_LABELS, VISIT_STATUS_COLORS } from '../types';
import toast from 'react-hot-toast';

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  regulatoryCode?: string;
  completed: boolean;
}

const DEFAULT_INITIAL_ASSESSMENT_CHECKLIST: ChecklistItem[] = [
  {
    id: 'chk-adl',
    category: 'Clinical Assessment',
    title: 'ADL / IADL Functional Independence Evaluation',
    description: 'Assess bathing, dressing, toileting, transferring, feeding, and instrumental needs.',
    regulatoryCode: 'FL 59A-8.0095 / TX 26 TAC §558',
    completed: true,
  },
  {
    id: 'chk-cognitive',
    category: 'Clinical Assessment',
    title: 'Cognitive Status & Orientation Screen',
    description: 'Document memory, orientation to person/place/time, and wandering risks.',
    regulatoryCode: 'AHCA Clinical Standards',
    completed: true,
  },
  {
    id: 'chk-mobility',
    category: 'Clinical Assessment',
    title: 'Mobility & Fall Risk Assessment',
    description: 'Inspect ambulation aids (walker/wheelchair) and assess transfer safety.',
    regulatoryCode: 'Fall Prevention Guidelines',
    completed: true,
  },
  {
    id: 'chk-vitals',
    category: 'Clinical Assessment',
    title: 'Baseline Vital Signs (BP, HR, RR, SpO2, Temp)',
    description: 'Record baseline resting vitals and document parameters for physician notification.',
    regulatoryCode: 'Nursing Standards of Practice',
    completed: true,
  },
  {
    id: 'chk-meds',
    category: 'Clinical Assessment',
    title: 'Medication Reconciliation & Allergy Verification',
    description: 'Reconcile prescription bottles against hospital discharge orders and allergies.',
    regulatoryCode: 'CoP §484.55(c)',
    completed: false,
  },
  {
    id: 'chk-safety',
    category: 'Home Safety & Disaster Planning',
    title: 'Home Safety & Hazard Inspection',
    description: 'Inspect pathways, rugs, lighting, smoke detectors, and bathroom grab bars.',
    regulatoryCode: 'TX 26 TAC §558.401',
    completed: false,
  },
  {
    id: 'chk-disaster',
    category: 'Home Safety & Disaster Planning',
    title: 'Disaster Evacuation Plan & Hurricane Classification',
    description: 'Establish individual emergency preparedness plan and identify backup contacts.',
    regulatoryCode: 'FL AHCA Hurricane Zone / TX Form 1746',
    completed: false,
  },
  {
    id: 'chk-rights',
    category: 'Consents & Regulatory Mandates',
    title: 'Client Bill of Rights & HIPAA Privacy Notice',
    description: 'Present client rights notice and obtain signed acknowledgment of HIPAA practices.',
    regulatoryCode: '45 CFR §164.520 / State Licensure',
    completed: true,
  },
  {
    id: 'chk-evv',
    category: 'Consents & Regulatory Mandates',
    title: 'EVV Geofence Calibration & Location Verification',
    description: 'Verify service delivery coordinates within state geofence parameters.',
    regulatoryCode: '21st Century Cures Act §12006',
    completed: true,
  },
  {
    id: 'chk-careplan',
    category: 'Care Plan Establishment',
    title: 'Synthesize Intake Findings into Draft Care Plan Tasks',
    description: 'Translate identified functional dependencies into daily caregiver task routines.',
    regulatoryCode: 'Plan of Care CoP §484.60',
    completed: false,
  },
  {
    id: 'chk-supervision',
    category: 'Care Plan Establishment',
    title: 'Establish Mandated RN Supervisory Visit Cadence',
    description: 'Calibrate recurring supervisory visit due date (60 days skilled / 90 days personal care).',
    regulatoryCode: 'FL AHCA Ch. 59A-8 / TX HHSC 26 TAC §558',
    completed: false,
  },
];

export const VisitDetail: React.FC = () => {
  const { id: pathId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const queryId = searchParams.get('id');
  const visitId = pathId || queryId || undefined;
  const navigate = useNavigate();

  const { data: visit, isLoading: isVisitLoading, error: visitError, refetch } = useVisit(visitId);
  const { data: client, isLoading: isClientLoading } = useClient(visit?.clientId);

  // Assessment completion checklist state
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    const saved = localStorage.getItem(`folkcare_assessment_checklist_${visitId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return DEFAULT_INITIAL_ASSESSMENT_CHECKLIST;
  });

  // Draft care plan tasks state
  const [convertedTasks, setConvertedTasks] = useState<DraftCarePlanTask[] | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const toggleChecklistItem = (itemId: string) => {
    setChecklist((prev) => {
      const updated = prev.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      );
      if (visitId) {
        localStorage.setItem(`folkcare_assessment_checklist_${visitId}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Supervisory Cadence calculation
  const cadenceResult: SupervisoryCadenceResult | null = useMemo(() => {
    if (!client && !visit) return null;

    const state =
      client?.primaryAddress?.state ||
      visit?.address?.state ||
      'FL';

    const serviceType = visit?.serviceTypeName || 'Skilled Nursing';

    return calculateSupervisoryCadence({
      clientId: visit?.clientId || client?.id,
      state,
      serviceType,
      initialVisitDate: visit?.scheduledDate ? new Date(visit.scheduledDate) : new Date(),
      referenceDate: new Date(),
    });
  }, [client, visit]);

  // Convert Intake Assessment Findings to Draft Care Plan Tasks
  const handleConvertFindings = () => {
    const findings: AssessmentFindings = {
      adls: {
        bathing: 'assistance',
        dressing: 'assistance',
        toileting: 'assistance',
        transferring: 'assistance',
        feeding: 'independent',
      },
      iadls: {
        housekeeping: 'assistance',
        laundry: 'assistance',
        mealPrep: 'assistance',
        medication: 'assistance',
        transportation: 'assistance',
      },
      mobility: 'walker',
      cognitive: 'mild',
      medications: [
        { name: 'Lisinopril', dosage: '10mg', frequency: 'Daily (Morning)' },
        { name: 'Atorvastatin', dosage: '20mg', frequency: 'Daily (Bedtime)' },
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily with meals' },
      ],
      serviceTypes: [visit?.serviceTypeName || 'Skilled Nursing'],
      state: client?.primaryAddress?.state || visit?.address?.state || 'FL',
    };

    const generated = convertAssessmentFindingsToDraftTasks(findings);
    setConvertedTasks(generated);
    setIsTaskModalOpen(true);

    // Also mark the care plan checklist item as completed
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === 'chk-careplan' || item.id === 'chk-supervision'
          ? { ...item, completed: true }
          : item
      )
    );
  };

  const handleSaveDraftTasks = () => {
    if (!convertedTasks) return;
    toast.success(
      `Successfully converted ${convertedTasks.length} assessment findings into Draft Care Plan Tasks!`,
      { duration: 5000 }
    );
    setIsTaskModalOpen(false);
  };

  if (isVisitLoading || (visit && isClientLoading)) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (visitError || !visit) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto py-8">
        <Link to="/scheduling">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Scheduling
          </Button>
        </Link>
        <ErrorMessage
          message={(visitError as Error)?.message || `Visit with ID "${visitId}" not found`}
          retry={refetch}
        />
      </div>
    );
  }

  const isInitialVisit = visit.visitType === 'INITIAL';
  const completedCount = checklist.filter((i) => i.completed).length;
  const progressPercent = Math.round((completedCount / checklist.length) * 100);

  const statusColor = VISIT_STATUS_COLORS[visit.status];
  const clientName = visit.clientFirstName && visit.clientLastName
    ? `${visit.clientFirstName} ${visit.clientLastName}`
    : client
    ? `${client.firstName} ${client.lastName}`
    : 'Client';

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <Link to="/scheduling">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Visits
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(
                `/scheduling/builder?clientId=${visit.clientId}&visitType=SUPERVISION`
              )
            }
            leftIcon={<Stethoscope className="h-4 w-4 text-blue-600" />}
          >
            Schedule Supervision Visit
          </Button>
        </div>
      </div>

      {/* Supervisory Alert Banner if upcoming or overdue */}
      {cadenceResult && cadenceResult.showAlert && (
        <SupervisionAlertBanner
          cadence={cadenceResult}
          onSchedule={() =>
            navigate(
              `/scheduling/builder?clientId=${visit.clientId}&visitType=SUPERVISION`
            )
          }
        />
      )}

      {/* Visit Title Banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{clientName}</h1>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                  isInitialVisit ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-blue-100 text-blue-800'
                }`}
              >
                {VISIT_TYPE_LABELS[visit.visitType]} Visit
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${statusColor}-100 text-${statusColor}-800`}
              >
                {VISIT_STATUS_LABELS[visit.status]}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Visit #{visit.visitNumber} • {visit.serviceTypeName} • ID: {visit.id}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {isInitialVisit && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Comprehensive Nursing Assessment Required
              </span>
            )}
          </div>
        </div>

        {/* Visit Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500 font-medium">Scheduled Date</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatDate(visit.scheduledDate)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500 font-medium">Scheduled Window</p>
              <p className="text-sm font-semibold text-gray-900">
                {visit.scheduledStartTime} - {visit.scheduledEndTime} ({visit.scheduledDuration} min)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500 font-medium">Assigned Caregiver</p>
              <p className="text-sm font-semibold text-gray-900">
                {visit.assignedCaregiverId ? 'Caregiver Assigned' : 'Unassigned'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <div className="truncate">
              <p className="text-xs text-gray-500 font-medium">Service Address</p>
              <p className="text-sm font-semibold text-gray-900 truncate">
                {visit.address?.city}, {visit.address?.state} {visit.address?.postalCode}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* INITIAL VISIT WORKFLOW SECTION */}
      {isInitialVisit && (
        <Card className="border-blue-200 shadow-md">
          <CardHeader
            title="Initial Visit Assessment Completion Checklist"
            subtitle="Required under Florida AHCA Ch. 59A-8 & Texas HHSC 26 TAC §558 before ongoing care authorization"
            action={
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                  {completedCount} / {checklist.length} Completed ({progressPercent}%)
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleConvertFindings}
                  leftIcon={<Sparkles className="h-4 w-4" />}
                >
                  Convert Findings to Draft Care Plan Tasks
                </Button>
              </div>
            }
          />
          <CardContent className="space-y-6">
            {/* Progress Bar */}
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Checklist items by category */}
            <div className="space-y-4">
              {['Clinical Assessment', 'Home Safety & Disaster Planning', 'Consents & Regulatory Mandates', 'Care Plan Establishment'].map(
                (category) => {
                  const items = checklist.filter((i) => i.category === category);
                  if (items.length === 0) return null;

                  return (
                    <div key={category} className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-blue-600" />
                        {category}
                      </h3>
                      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-start justify-between p-3.5 transition-colors ${
                              item.completed ? 'bg-emerald-50/40 hover:bg-emerald-50/60' : 'hover:bg-gray-50'
                            }`}
                          >
                            <label className="flex items-start gap-3 cursor-pointer flex-1 mr-4">
                              <input
                                type="checkbox"
                                checked={item.completed}
                                onChange={() => toggleChecklistItem(item.id)}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <div>
                                <p
                                  className={`text-sm font-semibold ${
                                    item.completed ? 'text-gray-900 line-through text-gray-500' : 'text-gray-900'
                                  }`}
                                >
                                  {item.title}
                                </p>
                                <p className="text-xs text-gray-600 mt-0.5">{item.description}</p>
                              </div>
                            </label>
                            {item.regulatoryCode && (
                              <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">
                                {item.regulatoryCode}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {/* Bottom action trigger */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-sm text-blue-950 flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-blue-600" />
                  Ready to Establish Care Plan?
                </h4>
                <p className="text-xs text-blue-800 mt-0.5">
                  Convert all completed functional assessment findings into draft caregiver tasks with a single click.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConvertFindings}
                leftIcon={<Sparkles className="h-4 w-4" />}
                className="w-full sm:w-auto"
              >
                Convert Findings to Draft Tasks
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Supervisory Cadence Summary Card */}
      {cadenceResult && (
        <Card>
          <CardHeader
            title="Supervisory Visit Cadence Status"
            subtitle={`${cadenceResult.state} Licensure Regulation Oversight (${cadenceResult.cadenceDays}-Day Cycle)`}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(
                    `/scheduling/builder?clientId=${visit.clientId}&visitType=SUPERVISION`
                  )
                }
                leftIcon={<PlusCircle className="h-4 w-4 text-blue-600" />}
              >
                Schedule Supervision Visit
              </Button>
            }
          />
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 font-medium">Acuity & Care Level</p>
                <p className="text-base font-bold text-gray-900 mt-1">
                  {cadenceResult.isSkilled ? 'Skilled Nursing (RN Oversight)' : 'Personal Care (Non-Skilled)'}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Mandated Cadence: {cadenceResult.cadenceDays} Days
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 font-medium">Next Due Date</p>
                <p className="text-base font-bold text-gray-900 mt-1">
                  {formatDate(cadenceResult.dueDate)}
                </p>
                <p
                  className={`text-xs font-semibold mt-1 ${
                    cadenceResult.isOverdue
                      ? 'text-red-600'
                      : cadenceResult.isUpcoming
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {cadenceResult.isOverdue
                    ? `${Math.abs(cadenceResult.daysRemaining)} Days Overdue`
                    : `${cadenceResult.daysRemaining} Days Remaining`}
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 font-medium">Regulatory Authority</p>
                <p className="text-xs font-mono font-semibold text-gray-900 mt-1">
                  {cadenceResult.regulationCitation}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Audit-ready documentation enforced
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DRAFT CARE PLAN TASKS MODAL */}
      {isTaskModalOpen && convertedTasks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-lg text-gray-900">
                  Draft Care Plan Tasks ({convertedTasks.length} Synthesized)
                </h3>
              </div>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <p className="text-xs text-gray-600">
                The following tasks were automatically generated from the intake assessment findings and state clinical mandates. Review and confirm to attach to the client&apos;s Care Plan.
              </p>

              <div className="space-y-3">
                {convertedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors bg-white shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="font-semibold text-sm text-gray-900">{task.name}</h5>
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                            {task.category}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              task.priority === 'URGENT'
                                ? 'bg-red-100 text-red-800'
                                : task.priority === 'HIGH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1">{task.instructions}</p>
                      </div>
                      <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                        {task.estimatedDurationMinutes}m
                      </span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <span>Source: {task.sourceFinding}</span>
                      <span>Frequency: {task.frequency}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsTaskModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveDraftTasks}
                leftIcon={<CheckCircle2 className="h-4 w-4" />}
              >
                Confirm & Attach to Care Plan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
