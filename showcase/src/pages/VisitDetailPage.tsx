import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Key,
  Compass,
  FileText,
  Printer,
  Calendar,
  Check,
  Building,
} from 'lucide-react';
import { ShowcaseLayout } from '../components/ShowcaseLayout';
import { useVisitProvider } from '@/core/providers/context';
import { getVisitTypeConfig } from '../config/visitTypeConfig.js';
import type { Visit, VisitTask } from '../types/showcase-types.js';

export const VisitDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const visitProvider = useVisitProvider();

  const { data: visit, isLoading, error } = useQuery<Visit>({
    queryKey: ['visit', id],
    queryFn: () => visitProvider.getVisitById(id!),
    enabled: !!id,
  });

  // Local state for interactive task checklist toggling
  const [tasks, setTasks] = useState<VisitTask[]>([]);

  React.useEffect(() => {
    if (visit?.tasks) {
      setTasks(visit.tasks);
    }
  }, [visit]);

  // Mutation to persist task toggle to mock provider
  const updateVisitMutation = useMutation({
    mutationFn: async (updatedTasks: VisitTask[]) => {
      if (!visit) return;
      return visitProvider.updateVisit?.(visit.id, {
        tasks: updatedTasks,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit', id] });
      queryClient.invalidateQueries({ queryKey: ['visits'] });
    },
  });

  const handleToggleTask = (taskId: string) => {
    const updated = tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            completed: !t.completed,
            completedAt: !t.completed ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          }
        : t
    );
    setTasks(updated);
    updateVisitMutation.mutate(updated);
  };

  if (isLoading) {
    return (
      <ShowcaseLayout title="Visit Details" description="Loading visit information...">
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Loading visit details...</p>
        </div>
      </ShowcaseLayout>
    );
  }

  if (error || !visit) {
    return (
      <ShowcaseLayout title="Visit Details" description="Visit details could not be found">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center max-w-lg mx-auto shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Visit Not Found</h2>
          <p className="text-sm text-gray-500 mb-6">
            The visit record with ID <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">{id}</code> could not be located.
          </p>
          <button
            type="button"
            onClick={() => navigate('/scheduling')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Schedule
          </button>
        </div>
      </ShowcaseLayout>
    );
  }

  const visitConfig = getVisitTypeConfig(visit.visitType);
  const TypeIcon = visitConfig.icon;

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const statusBadges: Record<string, { badge: string; dot: string; label: string }> = {
    SCHEDULED: { badge: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-600', label: 'Scheduled' },
    IN_PROGRESS: { badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-600 animate-pulse', label: 'In Progress' },
    COMPLETED: { badge: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-600', label: 'Completed' },
    UNASSIGNED: { badge: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-600', label: 'Unassigned' },
    CANCELLED: { badge: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-600', label: 'Cancelled' },
  };

  const statusStyle = statusBadges[visit.status] || {
    badge: 'bg-gray-100 text-gray-800 border-gray-200',
    dot: 'bg-gray-600',
    label: visit.status,
  };

  return (
    <ShowcaseLayout
      title={`Visit ${visit.visitNumber || visit.id}`}
      description={`${visitConfig.label} • ${visit.clientName}`}
    >
      <div className="space-y-6">
        {/* Navigation & Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/scheduling')}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors self-start"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schedule
          </button>

          <div className="flex items-center gap-2.5">
            {visit.caregiverPhone && (
              <a
                href={`tel:${visit.caregiverPhone}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <Phone className="w-4 h-4" />
                Call Caregiver
              </a>
            )}
            {visit.clientPhone && (
              <a
                href={`tel:${visit.clientPhone}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Phone className="w-4 h-4" />
                Call Client
              </a>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              title="Print Summary"
            >
              <Printer className="w-4 h-4 text-gray-500" />
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>

        {/* Visit Banner with Visit Type + Status */}
        <div
          className={`rounded-xl p-6 border transition-all shadow-sm ${visitConfig.bgClass} ${visitConfig.borderClass}`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-xl bg-white/90 shadow-sm border ${visitConfig.borderClass} ${visitConfig.colorClass}`}
              >
                <TypeIcon className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">{visitConfig.label}</h1>
                  <span className="text-sm font-mono font-medium text-gray-600 bg-white/80 px-2 py-0.5 rounded border border-gray-200">
                    {visit.visitNumber || visit.id}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1 max-w-xl">{visitConfig.description}</p>
                <div className="flex items-center gap-3 text-xs text-gray-600 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    {visit.scheduledDate}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    {visit.scheduledStartTime} - {visit.scheduledEndTime} ({visit.scheduledDuration} min)
                  </span>
                </div>
              </div>
            </div>

            {/* Status indicator on banner */}
            <div className="flex flex-col md:items-end gap-1.5 self-start md:self-center">
              <span
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${statusStyle.badge}`}
              >
                <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
                {statusStyle.label}
              </span>
              <span className="text-xs text-gray-500 font-medium">
                {visit.status === 'COMPLETED'
                  ? 'EVV Verified & Completed'
                  : visit.status === 'IN_PROGRESS'
                  ? 'Currently Active in Field'
                  : visit.status === 'UNASSIGNED'
                  ? 'Caregiver Staffing Needed'
                  : 'Scheduled for Care Delivery'}
              </span>
            </div>
          </div>
        </div>

        {/* 3-Column Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Client Demographics & Address with Access Instructions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-200 bg-gray-50/70">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900 text-base">Client Demographics</h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Care recipient identity & residence</p>
            </div>

            <div className="p-5 space-y-4 flex-1">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Client Name</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">{visit.clientName}</p>
                <p className="text-xs text-gray-500 font-mono">ID: {visit.clientId}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <div>
                  <p className="text-xs font-medium text-gray-500">Phone</p>
                  {visit.clientPhone ? (
                    <a
                      href={`tel:${visit.clientPhone}`}
                      className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 mt-0.5 truncate"
                    >
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      {visit.clientPhone}
                    </a>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Not provided</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Email</p>
                  {visit.clientEmail ? (
                    <a
                      href={`mailto:${visit.clientEmail}`}
                      className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 mt-0.5 truncate"
                      title={visit.clientEmail}
                    >
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{visit.clientEmail}</span>
                    </a>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Not provided</p>
                  )}
                </div>
              </div>

              {/* Service Address */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  Service Location
                </p>
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-0.5">
                  <p className="font-semibold text-gray-900">{visit.address.street1}</p>
                  {visit.address.street2 && <p>{visit.address.street2}</p>}
                  <p>
                    {visit.address.city}, {visit.address.stateCode} {visit.address.zipCode}
                  </p>
                  {visit.address.latitude && visit.address.longitude && (
                    <p className="text-[11px] text-gray-500 font-mono pt-1">
                      GPS: {visit.address.latitude.toFixed(4)}, {visit.address.longitude.toFixed(4)}
                    </p>
                  )}
                </div>
              </div>

              {/* Access Instructions Callout */}
              <div className="pt-2">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3.5 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 font-bold mb-1">
                    <Key className="w-4 h-4 text-amber-600" />
                    Access & Entry Instructions
                  </div>
                  <p className="text-amber-800 leading-relaxed">
                    {visit.address.accessInstructions ||
                      'Standard entry. Ring front doorbell upon arrival and await client or family response.'}
                  </p>
                </div>
              </div>

              {/* Emergency Contact */}
              {visit.emergencyContact && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Emergency Contact
                  </p>
                  <div className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                    <p className="font-bold text-gray-900">{visit.emergencyContact.name}</p>
                    <p className="text-gray-500 text-[11px]">
                      Relationship: {visit.emergencyContact.relationship}
                    </p>
                    <a
                      href={`tel:${visit.emergencyContact.phone}`}
                      className="text-blue-600 hover:underline flex items-center gap-1 mt-1 font-medium"
                    >
                      <Phone className="w-3 h-3" />
                      {visit.emergencyContact.phone}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Caregiver Assignment Info & Call Action */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-200 bg-gray-50/70">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-gray-900 text-base">Caregiver Assignment</h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Staffing & provider credentials</p>
            </div>

            <div className="p-5 space-y-4 flex-1">
              {visit.caregiverId ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-blue-500 text-white font-bold flex items-center justify-center text-base shadow-sm">
                      {visit.caregiverName
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-gray-900 truncate">{visit.caregiverName}</p>
                      <p className="text-xs text-indigo-600 font-medium">
                        {visit.caregiverRole || 'Certified Home Caregiver'}
                      </p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {visit.caregiverId}</p>
                    </div>
                  </div>

                  {/* Primary Call Action Button */}
                  {visit.caregiverPhone && (
                    <div className="pt-2">
                      <a
                        href={`tel:${visit.caregiverPhone}`}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 shadow transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        Call Caregiver ({visit.caregiverPhone})
                      </a>
                    </div>
                  )}

                  {/* Assignment Meta */}
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Assignment Method:</span>
                      <span className="font-semibold text-gray-800 bg-white px-2 py-0.5 rounded border border-gray-200">
                        {visit.assignmentMethod || 'MANUAL'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Shift Authorization:</span>
                      <span className="font-semibold text-emerald-700">Verified & Active</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Scheduled Duration:</span>
                      <span className="font-semibold text-gray-800">{visit.scheduledDuration} minutes</span>
                    </div>
                  </div>

                  {/* Services Delivered */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Authorized Care Services
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {visit.services?.map((svc, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-medium"
                        >
                          {svc}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-6 text-center space-y-3">
                  <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-gray-900">Caregiver Unassigned</h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                      This visit requires a qualified caregiver before service start.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/shifts')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Match & Assign Caregiver
                  </button>
                </div>
              )}

              {/* Visit Notes */}
              {visit.notes && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    Visit Coordinator Notes
                  </p>
                  <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200 leading-relaxed italic">
                    "{visit.notes}"
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Column 3: EVV Details & Tasks Checklist */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-200 bg-gray-50/70">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-gray-900 text-base">EVV & Task Execution</h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">21st Century Cures Act compliance</p>
            </div>

            <div className="p-5 space-y-5 flex-1">
              {/* EVV Telephony/GPS Details */}
              <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-emerald-700" />
                    EVV Verification Status
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      visit.evv?.geofenceStatus === 'VERIFIED'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {visit.evv?.geofenceStatus || 'PENDING'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-gray-500 block text-[11px]">Method</span>
                    <span className="font-semibold text-gray-800">
                      {visit.evv?.verificationMethod || 'GPS Mobile App'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">Geofence Accuracy</span>
                    <span className="font-semibold text-gray-800">
                      {visit.evv?.distanceMeters !== undefined
                        ? `${visit.evv.distanceMeters}m from client`
                        : 'Pending arrival'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">Actual Clock-In</span>
                    <span className="font-semibold text-emerald-700">
                      {visit.actualStartTime || visit.evv?.clockInTime || 'Not started'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">Actual Clock-Out</span>
                    <span className="font-semibold text-gray-800">
                      {visit.actualEndTime || visit.evv?.clockOutTime || 'In progress / Pending'}
                    </span>
                  </div>
                </div>

                {visit.actualDuration && (
                  <p className="text-[11px] text-emerald-800 pt-1 border-t border-emerald-200/60">
                    Logged Duration: <strong>{visit.actualDuration} minutes</strong> (Scheduled:{' '}
                    {visit.scheduledDuration} min)
                  </p>
                )}
              </div>

              {/* Tasks Checklist with Interactive Completion Tracking */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      Visit Care Tasks
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {completedCount} of {totalCount} completed ({progressPercent}%)
                    </p>
                  </div>
                  <span className="text-xs font-bold text-blue-600">{progressPercent}%</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Tasks List */}
                <div className="space-y-2">
                  {tasks.length > 0 ? (
                    tasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => handleToggleTask(task.id)}
                        className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                          task.completed
                            ? 'bg-emerald-50/50 border-emerald-200 text-gray-800'
                            : 'bg-white border-gray-200 hover:border-blue-300 text-gray-700'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center mt-0.5 flex-shrink-0 transition-colors ${
                            task.completed
                              ? 'bg-emerald-600 text-white'
                              : 'border border-gray-300 bg-white'
                          }`}
                        >
                          {task.completed && <Check className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-medium ${
                                task.completed ? 'line-through text-gray-500' : 'text-gray-900'
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.required && (
                              <span className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.2 rounded border border-red-200 font-bold">
                                Required
                              </span>
                            )}
                          </div>
                          {task.category && (
                            <span className="text-[10px] text-gray-500 font-mono mt-0.5 block">
                              Category: {task.category}
                            </span>
                          )}
                          {task.completedAt && (
                            <span className="text-[10px] text-emerald-700 font-medium mt-0.5 block">
                              Completed at {task.completedAt}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-lg text-center text-xs text-gray-500 border border-gray-200">
                      No specific task checklist assigned to this visit.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ShowcaseLayout>
  );
};
