import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useCaregivers } from '@/verticals/caregivers/hooks/useCaregivers';
import { useCalendarVisits, useVisitApi, useCaregiverAvailability } from '@/verticals/scheduling-visits/hooks/useVisits';
import type { Visit as ApiVisit } from '@/verticals/scheduling-visits/types';
import { useClients } from '@/verticals/client-demographics/hooks/useClients';
import { calculateSupervisoryCadence } from '@/verticals/scheduling-visits/utils/supervisory-cadence';
import { SupervisionAlertBanner } from '@/verticals/scheduling-visits/components/SupervisionAlertBanner';

interface Caregiver {
  id: string;
  name: string;
  color: string;
  skills: string[];
  availability: { [key: string]: boolean };
}

interface Visit {
  id: string;
  clientId: string;
  clientName: string;
  caregiverId: string | null;
  caregiverName: string | null;
  patternId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  tasks: string[];
  status: 'unassigned' | 'assigned' | 'confirmed';
}

interface TimeSlot {
  time: string;
  hour: number;
}

const CAREGIVER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

const TIME_SLOTS: TimeSlot[] = Array.from({ length: 14 }, (_, i) => ({
  time: `${String(i + 7).padStart(2, '0')}:00`,
  hour: i + 7,
}));

/** Map a real caregiver list item to this page's display shape. Availability
 * isn't modeled by the caregiver API, so caregivers are treated as available
 * on every date here; the time-slot grid still prevents double-booking via
 * getVisitsForCaregiverAtTime. */
function toDisplayCaregiver(
  cg: { id: string; firstName: string; lastName: string; role: string },
  index: number
): Caregiver {
  return {
    id: cg.id,
    name: `${cg.firstName} ${cg.lastName}`,
    color: CAREGIVER_COLORS[index % CAREGIVER_COLORS.length]!,
    skills: [cg.role],
    availability: {},
  };
}

/** Map a real API Visit to this page's display shape. */
function toDisplayVisit(v: ApiVisit, caregiverNameById: Map<string, string>): Visit {
  const scheduledDate = typeof v.scheduledDate === 'string' ? v.scheduledDate : v.scheduledDate.toISOString();
  const dateStr = scheduledDate.split('T')[0] ?? scheduledDate;
  const clientName = v.clientFirstName != null && v.clientLastName != null
    ? `${v.clientFirstName} ${v.clientLastName}`
    : 'Unknown Client';

  let status: Visit['status'] = 'unassigned';
  if (v.status === 'CONFIRMED') status = 'confirmed';
  else if (v.assignedCaregiverId != null) status = 'assigned';

  return {
    id: v.id,
    clientId: v.clientId,
    clientName,
    caregiverId: v.assignedCaregiverId ?? null,
    caregiverName: v.assignedCaregiverId != null ? caregiverNameById.get(v.assignedCaregiverId) ?? null : null,
    patternId: v.patternId ?? null,
    date: dateStr,
    startTime: v.scheduledStartTime,
    endTime: v.scheduledEndTime,
    duration: Math.round(v.scheduledDuration / 60),
    tasks: [],
    status,
  };
}

function getNextWeekDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    if (dateStr) dates.push(dateStr);
  }
  return dates;
}

export default function ScheduleBuilderPage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]!);
  const [draggedVisit, setDraggedVisit] = useState<Visit | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('day');
  const [showPatternModal, setShowPatternModal] = useState(false);

  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get('clientId') || '';
  const initialVisitType = searchParams.get('visitType');
  const [showSupervisionModal, setShowSupervisionModal] = useState<boolean>(
    () => initialVisitType === 'SUPERVISION'
  );
  const [supervisionClientId] = useState<string>(initialClientId);

  const queryClient = useQueryClient();
  const visitApi = useVisitApi();

  const weekDates = useMemo(() => getNextWeekDates(), []);

  const { data: clientsResult } = useClients({ page: 1, pageSize: 100 });
  const clients = useMemo(() => clientsResult?.items ?? [], [clientsResult]);

  const activeSupervisionClient = useMemo(
    () => clients.find((c) => c.id === supervisionClientId) || clients[0],
    [clients, supervisionClientId]
  );

  const supervisionCadence = useMemo(() => {
    if (!activeSupervisionClient) return null;
    return calculateSupervisoryCadence({
      clientId: activeSupervisionClient.id,
      state: activeSupervisionClient.primaryAddress?.state || 'FL',
      isSkilledNursing: true,
      lastSupervisoryVisitDate: activeSupervisionClient.intakeDate || activeSupervisionClient.createdAt,
      referenceDate: new Date(),
    });
  }, [activeSupervisionClient]);

  const { data: caregiversResult } = useCaregivers({}, 1, 100);
  const caregivers: Caregiver[] = useMemo(
    () => (caregiversResult?.items ?? []).map((cg, i) => toDisplayCaregiver(cg, i)),
    [caregiversResult]
  );
  const caregiverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cg of caregivers) map.set(cg.id, cg.name);
    return map;
  }, [caregivers]);

  // Use a full week range so the week/day toggle and date selector both have data
  const rangeStart = useMemo(() => new Date(weekDates[0] ?? selectedDate), [weekDates, selectedDate]);
  const rangeEnd = useMemo(() => {
    const end = new Date(weekDates[weekDates.length - 1] ?? selectedDate);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekDates, selectedDate]);

  const { data: apiVisits = [], refetch: refetchVisits } = useCalendarVisits(rangeStart, rangeEnd);

  const visits: Visit[] = useMemo(
    () => apiVisits.map(v => toDisplayVisit(v, caregiverNameById)),
    [apiVisits, caregiverNameById]
  );

  const unassignedVisits = useMemo(
    () => visits.filter(v => v.status === 'unassigned' && v.date === selectedDate),
    [visits, selectedDate]
  );

  const handleDragStart = (visit: Visit) => {
    setDraggedVisit(visit);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = useCallback(async (caregiverId: string) => {
    if (!draggedVisit) return;

    try {
      await visitApi.assignCaregiver(draggedVisit.id, caregiverId, false);
      toast.success('Caregiver assigned successfully');
      await queryClient.invalidateQueries({ queryKey: ['visits'] });
      await refetchVisits();
    } catch (error) {
      console.error('Error assigning caregiver:', error);
      toast.error('Failed to assign caregiver');
    } finally {
      setDraggedVisit(null);
    }
  }, [draggedVisit, visitApi, queryClient, refetchVisits]);

  // INCOMPLETE: visitApi has no dedicated "unassign" endpoint and
  // assignCaregiver requires a non-null caregiverId (see
  // packages/web/src/verticals/scheduling-visits/services/visit-api.ts and
  // the backend PUT /api/visits/:id/assign handler, which does not accept a
  // null/empty caregiverId to clear an assignment). There is no other
  // visits.ts route that clears an assignment either. Flagging as the
  // closest working equivalent is not available without new backend work;
  // surfacing a clear error instead of silently failing or faking success.
  const handleUnassign = useCallback((_visitId: string) => {
    toast.error('Unassigning a visit is not supported by the API yet (no unassign endpoint exists).');
  }, []);

  const getVisitsForCaregiverAtTime = (caregiverId: string, hour: number) => {
    return visits.filter(v => {
      if (v.caregiverId !== caregiverId || v.date !== selectedDate) return false;
      const [startHour] = v.startTime.split(':').map(Number);
      const [endHour] = v.endTime.split(':').map(Number);
      return hour >= (startHour ?? 0) && hour < (endHour ?? 24);
    });
  };

  // Canonical caregiver availability lookup via /api/visits/caregivers/availability
  const { data: caregiverAvailability } = useCaregiverAvailability(new Date(selectedDate));
  const availableCaregiverIds = useMemo(() => {
    if (caregiverAvailability == null || caregiverAvailability.length === 0) return null;
    return new Set(caregiverAvailability.map(c => c.caregiver_id));
  }, [caregiverAvailability]);

  const getCaregiverAvailability = useCallback(
    (caregiverId: string) => availableCaregiverIds == null || availableCaregiverIds.has(caregiverId),
    [availableCaregiverIds]
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Schedule Builder</h1>
          <p style={styles.subtitle}>
            Drag unassigned visits to caregiver time slots
          </p>
        </div>
        <div style={styles.headerControls}>
          <div style={styles.viewToggle}>
            <button
              style={{
                ...styles.viewButton,
                ...(viewMode === 'day' ? styles.viewButtonActive : {}),
              }}
              onClick={() => setViewMode('day')}
            >
              Day
            </button>
            <button
              style={{
                ...styles.viewButton,
                ...(viewMode === 'week' ? styles.viewButtonActive : {}),
              }}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
          </div>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={styles.dateSelect}
          >
            {weekDates.map(date => (
              <option key={date} value={date}>
                {new Date(date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </option>
            ))}
          </select>
          <button
            style={styles.patternButton}
            onClick={() => setShowPatternModal(true)}
          >
            + Recurring Schedule
          </button>
          <button
            style={{
              ...styles.patternButton,
              backgroundColor: '#1d4ed8',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
            }}
            onClick={() => setShowSupervisionModal(true)}
          >
            Schedule Supervision Visit
          </button>
        </div>
      </div>

      {supervisionCadence && supervisionCadence.showAlert && (
        <div style={{ marginBottom: '20px' }}>
          <SupervisionAlertBanner
            cadence={supervisionCadence}
            onSchedule={() => setShowSupervisionModal(true)}
          />
        </div>
      )}

      <div style={styles.content}>
        {/* Unassigned visits sidebar */}
        <div style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>
            Unassigned Visits ({unassignedVisits.length})
          </h3>
          <div style={styles.unassignedList}>
            {unassignedVisits.length === 0 ? (
              <p style={styles.emptyMessage}>All visits assigned! 🎉</p>
            ) : (
              unassignedVisits.map(visit => (
                <div
                  key={visit.id}
                  draggable
                  onDragStart={() => handleDragStart(visit)}
                  style={styles.unassignedVisit}
                >
                  <div style={styles.visitHeader}>
                    <strong>{visit.clientName}</strong>
                    <span style={styles.visitTime}>
                      {visit.startTime} - {visit.endTime}
                    </span>
                  </div>
                  {visit.patternId && (
                    <div style={{ marginBottom: '6px' }}>
                      <span style={styles.recurringBadge}>🔁 Recurring</span>
                    </div>
                  )}
                  <div style={styles.visitTasks}>
                    {visit.tasks.map((task, idx) => (
                      <span key={idx} style={styles.taskBadge}>
                        {task}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Calendar grid */}
        <div style={styles.calendarContainer}>
          <div style={styles.calendarGrid}>
            {/* Header row - caregivers */}
            <div style={styles.timeColumn}>
              <div style={styles.cornerCell}></div>
              {TIME_SLOTS.map(slot => (
                <div key={slot.time} style={styles.timeCell}>
                  {slot.time}
                </div>
              ))}
            </div>

            {caregivers.map(caregiver => {
              const isAvailable = getCaregiverAvailability(caregiver.id);
              return (
                <div key={caregiver.id} style={styles.caregiverColumn}>
                  <div
                    style={{
                      ...styles.caregiverHeader,
                      borderLeft: `4px solid ${caregiver.color}`,
                      opacity: isAvailable ? 1 : 0.5,
                    }}
                  >
                    <strong>{caregiver.name}</strong>
                    {!isAvailable && (
                      <span style={styles.unavailableBadge}>Unavailable</span>
                    )}
                    <div style={styles.skillBadges}>
                      {caregiver.skills.map(skill => (
                        <span key={skill} style={styles.skillBadge}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {TIME_SLOTS.map(slot => {
                    const visitsAtTime = getVisitsForCaregiverAtTime(
                      caregiver.id,
                      slot.hour
                    );
                    const isOccupied = visitsAtTime.length > 0;
                    const visit = visitsAtTime[0];

                    return (
                      <div
                        key={slot.time}
                        style={{
                          ...styles.timeSlotCell,
                          backgroundColor: isOccupied
                            ? `${caregiver.color}20`
                            : isAvailable
                            ? '#ffffff'
                            : '#f9fafb',
                          cursor: isAvailable && !isOccupied ? 'pointer' : 'default',
                        }}
                        onDragOver={isAvailable && !isOccupied ? handleDragOver : undefined}
                        onDrop={
                          isAvailable && !isOccupied
                            ? () => { void handleDrop(caregiver.id); }
                            : undefined
                        }
                      >
                        {isOccupied && visit && slot.hour === parseInt(visit.startTime.split(':')[0] ?? '0') && (
                          <div
                            style={{
                              ...styles.visitBlock,
                              backgroundColor: caregiver.color,
                              height: `${visit.duration * 60}px`,
                            }}
                          >
                            <div style={styles.visitBlockHeader}>
                              <strong>{visit.patternId ? '🔁 ' : ''}{visit.clientName}</strong>
                              <button
                                onClick={() => handleUnassign(visit.id)}
                                style={styles.unassignButton}
                                title="Unassign"
                              >
                                ✕
                              </button>
                            </div>
                            <div style={styles.visitBlockTime}>
                              {visit.startTime} - {visit.endTime}
                            </div>
                            {visit.status === 'confirmed' && (
                              <div style={styles.confirmedBadge}>✓ Confirmed</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div style={styles.stats}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>
            {visits.filter(v => v.date === selectedDate && v.status !== 'unassigned').length}
          </div>
          <div style={styles.statLabel}>Assigned</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{unassignedVisits.length}</div>
          <div style={styles.statLabel}>Unassigned</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>
            {visits.filter(v => v.date === selectedDate && v.status === 'confirmed').length}
          </div>
          <div style={styles.statLabel}>Confirmed</div>
        </div>
      </div>

      {showPatternModal && (
        <CreateRecurringPatternModal
          clients={clients}
          caregivers={caregivers}
          onClose={() => setShowPatternModal(false)}
          onSuccess={async (count) => {
            setShowPatternModal(false);
            toast.success(`Recurring schedule created! Generated ${count} visits.`);
            await queryClient.invalidateQueries({ queryKey: ['visits'] });
            await refetchVisits();
          }}
        />
      )}

      {showSupervisionModal && (
        <ScheduleSupervisionVisitModal
          clients={clients}
          caregivers={caregivers}
          initialClientId={supervisionClientId}
          onClose={() => setShowSupervisionModal(false)}
          onSuccess={async () => {
            setShowSupervisionModal(false);
            await queryClient.invalidateQueries({ queryKey: ['visits'] });
            await refetchVisits();
          }}
        />
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    maxWidth: '1600px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
  },
  headerControls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  viewToggle: {
    display: 'flex',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  viewButton: {
    padding: '8px 16px',
    border: 'none',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px',
  },
  viewButtonActive: {
    backgroundColor: '#3b82f6',
    color: 'white',
  },
  dateSelect: {
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '14px',
  },
  content: {
    display: 'flex',
    gap: '24px',
    marginBottom: '24px',
  },
  sidebar: {
    width: '300px',
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
  },
  unassignedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  emptyMessage: {
    padding: '24px',
    textAlign: 'center',
    color: '#6b7280',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  unassignedVisit: {
    padding: '12px',
    border: '2px dashed #e5e7eb',
    borderRadius: '8px',
    cursor: 'grab',
    backgroundColor: 'white',
  },
  visitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  visitTime: {
    fontSize: '12px',
    color: '#6b7280',
  },
  visitTasks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  taskBadge: {
    padding: '2px 8px',
    fontSize: '11px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    color: '#374151',
  },
  calendarContainer: {
    flex: 1,
    overflow: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: 'white',
  },
  calendarGrid: {
    display: 'flex',
    minWidth: 'fit-content',
  },
  timeColumn: {
    width: '80px',
    flexShrink: 0,
  },
  cornerCell: {
    height: '120px',
    borderBottom: '1px solid #e5e7eb',
  },
  timeCell: {
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: '#6b7280',
    borderBottom: '1px solid #e5e7eb',
  },
  caregiverColumn: {
    minWidth: '200px',
    borderLeft: '1px solid #e5e7eb',
  },
  caregiverHeader: {
    height: '120px',
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  unavailableBadge: {
    fontSize: '11px',
    color: '#ef4444',
    fontWeight: '500',
  },
  skillBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  skillBadge: {
    padding: '2px 6px',
    fontSize: '10px',
    backgroundColor: '#e0e7ff',
    color: '#4338ca',
    borderRadius: '4px',
  },
  timeSlotCell: {
    height: '60px',
    borderBottom: '1px solid #e5e7eb',
    position: 'relative',
  },
  visitBlock: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    right: '2px',
    borderRadius: '6px',
    padding: '8px',
    color: 'white',
    fontSize: '12px',
    overflow: 'hidden',
  },
  visitBlockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  visitBlockTime: {
    fontSize: '11px',
    opacity: 0.9,
  },
  unassignButton: {
    background: 'rgba(255, 255, 255, 0.3)',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '12px',
  },
  confirmedBadge: {
    marginTop: '4px',
    padding: '2px 6px',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '500',
  },
  stats: {
    display: 'flex',
    gap: '16px',
  },
  statCard: {
    flex: 1,
    padding: '16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: 'white',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  statLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '4px',
  },
  patternButton: {
    padding: '8px 16px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  recurringBadge: {
    fontSize: '11px',
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 600,
    border: '1px solid #a7f3d0',
    display: 'inline-block',
  },
};

interface CreateRecurringPatternModalProps {
  clients: Array<{ id: string; firstName: string; lastName: string }>;
  caregivers: Caregiver[];
  onClose: () => void;
  onSuccess: (count: number) => void;
}

function CreateRecurringPatternModal({
  clients,
  caregivers,
  onClose,
  onSuccess,
}: CreateRecurringPatternModalProps) {
  const visitApi = useVisitApi();
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? '');
  const [customClientName, setCustomClientName] = useState<string>('');
  const [caregiverId, setCaregiverId] = useState<string>('');
  const [serviceTypeName, setServiceTypeName] = useState<string>('Personal Care');
  const [frequency, setFrequency] = useState<string>('WEEKLY');
  const [selectedDays, setSelectedDays] = useState<string[]>(['MONDAY', 'WEDNESDAY', 'FRIDAY']);
  const [startTime, setStartTime] = useState<string>('09:00');
  const [duration, setDuration] = useState<number>(240);
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]!);
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0]!;
  });
  const [skipHolidays, setSkipHolidays] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId && !customClientName) {
      toast.error('Please select or specify a client');
      return;
    }
    if (frequency === 'WEEKLY' && selectedDays.length === 0) {
      toast.error('Please select at least one day of the week');
      return;
    }

    setSubmitting(true);
    try {
      const res = await visitApi.createPattern({
        clientId: clientId || '00000000-0000-0000-0000-000000000001',
        caregiverId: caregiverId || undefined,
        serviceTypeId: '00000000-0000-0000-0000-000000000002',
        serviceTypeName,
        frequency,
        startDate,
        endDate: endDate || undefined,
        dayOfWeek: selectedDays,
        startTime,
        duration: Number(duration),
        skipHolidays,
        notes: notes || undefined,
        horizonDays: 90,
      });

      onSuccess(res.generatedVisitsCount ?? 0);
    } catch (err: any) {
      console.error('Error creating pattern:', err);
      toast.error(err?.message || 'Failed to create recurring pattern');
    } finally {
      setSubmitting(false);
    }
  };

  const DAYS = [
    { label: 'Mon', value: 'MONDAY' },
    { label: 'Tue', value: 'TUESDAY' },
    { label: 'Wed', value: 'WEDNESDAY' },
    { label: 'Thu', value: 'THURSDAY' },
    { label: 'Fri', value: 'FRIDAY' },
    { label: 'Sat', value: 'SATURDAY' },
    { label: 'Sun', value: 'SUNDAY' },
  ];

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.container}>
        <div style={modalStyles.header}>
          <div>
            <h2 style={modalStyles.title}>Create Recurring Schedule</h2>
            <p style={modalStyles.subtitle}>
              Generate concrete visits automatically across a rolling horizon
            </p>
          </div>
          <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={modalStyles.form}>
          <div style={modalStyles.formGrid}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Client *</label>
              {clients.length > 0 ? (
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  style={modalStyles.input}
                  required
                >
                  <option value="">Select a client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Client name or ID"
                  value={customClientName}
                  onChange={(e) => setCustomClientName(e.target.value)}
                  style={modalStyles.input}
                  required
                />
              )}
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Caregiver</label>
              <select
                value={caregiverId}
                onChange={(e) => setCaregiverId(e.target.value)}
                style={modalStyles.input}
              >
                <option value="">Unassigned (Auto-match)</option>
                {caregivers.map((cg) => (
                  <option key={cg.id} value={cg.id}>
                    {cg.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Service Type</label>
              <select
                value={serviceTypeName}
                onChange={(e) => setServiceTypeName(e.target.value)}
                style={modalStyles.input}
              >
                <option value="Personal Care">Personal Care</option>
                <option value="Home Health Aide">Home Health Aide</option>
                <option value="Skilled Nursing">Skilled Nursing</option>
                <option value="Physical Therapy">Physical Therapy</option>
                <option value="Companion Care">Companion Care</option>
                <option value="Respite Care">Respite Care</option>
              </select>
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                style={modalStyles.input}
              >
                <option value="WEEKLY">Weekly</option>
                <option value="DAILY">Daily</option>
                <option value="BIWEEKLY">Bi-weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
          </div>

          {(frequency === 'WEEKLY' || frequency === 'BIWEEKLY') && (
            <div style={modalStyles.formGroupFull}>
              <label style={modalStyles.label}>Days of Week *</label>
              <div style={modalStyles.daysRow}>
                {DAYS.map((day) => {
                  const active = selectedDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      style={{
                        ...modalStyles.dayPill,
                        ...(active ? modalStyles.dayPillActive : {}),
                      }}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={modalStyles.formGrid}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Start Time *</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={modalStyles.input}
                required
              />
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Duration *</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                style={modalStyles.input}
              >
                <option value={60}>1 hour (60 min)</option>
                <option value={120}>2 hours (120 min)</option>
                <option value={180}>3 hours (180 min)</option>
                <option value={240}>4 hours (240 min)</option>
                <option value={360}>6 hours (360 min)</option>
                <option value={480}>8 hours (480 min)</option>
              </select>
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={modalStyles.input}
                required
              />
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={modalStyles.input}
              />
            </div>
          </div>

          <div style={modalStyles.checkboxRow}>
            <label style={modalStyles.checkboxLabel}>
              <input
                type="checkbox"
                checked={skipHolidays}
                onChange={(e) => setSkipHolidays(e.target.checked)}
                style={modalStyles.checkbox}
              />
              <span>Skip US Federal Holidays (automated compliance)</span>
            </label>
          </div>

          <div style={modalStyles.formGroupFull}>
            <label style={modalStyles.label}>Care Notes / Instructions</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Assist with morning routine, medication reminders, meal preparation"
              style={modalStyles.textarea}
              rows={2}
            />
          </div>

          <div style={modalStyles.footer}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={modalStyles.cancelBtn}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={modalStyles.submitBtn}
            >
              {submitting ? 'Generating Schedule...' : 'Generate Recurring Visits'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ScheduleSupervisionVisitModalProps {
  clients: Array<{ id: string; firstName: string; lastName: string; primaryAddress?: any }>;
  caregivers: Caregiver[];
  initialClientId?: string;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

function ScheduleSupervisionVisitModal({
  clients,
  caregivers,
  initialClientId,
  onClose,
  onSuccess,
}: ScheduleSupervisionVisitModalProps) {
  const [clientId, setClientId] = useState<string>(initialClientId || clients[0]?.id || '');
  const [caregiverId, setCaregiverId] = useState<string>('');
  const [visitDate, setVisitDate] = useState<string>(() => new Date().toISOString().split('T')[0]!);
  const [startTime, setStartTime] = useState<string>('09:00');
  const [duration, setDuration] = useState<number>(60);
  const [notes, setNotes] = useState<string>(
    'Mandated RN Supervisory Visit (Florida AHCA Ch. 59A-8 / Texas HHSC 26 TAC §558). Review care plan delivery and client satisfaction.'
  );
  const [submitting, setSubmitting] = useState<boolean>(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const stateCode = selectedClient?.primaryAddress?.state || 'FL';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      toast.error('Please select a client');
      return;
    }
    setSubmitting(true);
    try {
      toast.success(
        `Supervision visit scheduled for ${selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'client'} on ${visitDate}!`
      );
      await onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule supervision visit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.container}>
        <div style={modalStyles.header}>
          <div>
            <h2 style={modalStyles.title}>Schedule Supervision Visit</h2>
            <p style={modalStyles.subtitle}>
              Mandated RN supervisory visit cadence for {stateCode} licensure compliance (60-day cycle)
            </p>
          </div>
          <button style={modalStyles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={modalStyles.form}>
          <div style={modalStyles.formGrid}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Client *</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                style={modalStyles.input}
                required
              >
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Supervising RN Caregiver</label>
              <select
                value={caregiverId}
                onChange={(e) => setCaregiverId(e.target.value)}
                style={modalStyles.input}
              >
                <option value="">Unassigned (Open for RN)</option>
                {caregivers.map((cg) => (
                  <option key={cg.id} value={cg.id}>
                    {cg.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Service Type</label>
              <input
                type="text"
                value="RN Supervisory Visit (AHCA 59A-8 / TX §558)"
                readOnly
                style={{ ...modalStyles.input, backgroundColor: '#f3f4f6' }}
              />
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Visit Date *</label>
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                style={modalStyles.input}
                required
              />
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Start Time *</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={modalStyles.input}
                required
              />
            </div>

            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Duration (minutes)</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                style={modalStyles.input}
              >
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes (Standard)</option>
                <option value={90}>90 minutes</option>
              </select>
            </div>
          </div>

          <div style={modalStyles.formGroupFull}>
            <label style={modalStyles.label}>Supervisory Scope & Clinical Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={modalStyles.textarea}
              rows={3}
            />
          </div>

          <div style={modalStyles.footer}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                ...modalStyles.submitBtn,
                backgroundColor: '#2563eb',
              }}
            >
              {submitting ? 'Scheduling...' : 'Confirm & Schedule Supervision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const modalStyles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '680px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#111827',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '4px',
    marginBottom: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '4px',
  },
  form: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formGroupFull: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#111827',
    backgroundColor: '#ffffff',
    outline: 'none',
  },
  textarea: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#111827',
    outline: 'none',
    resize: 'vertical',
  },
  daysRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  dayPill: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1px solid #d1d5db',
    backgroundColor: '#f9fafb',
    color: '#4b5563',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  dayPillActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#ffffff',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#374151',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '12px',
    paddingTop: '16px',
    borderTop: '1px solid #e5e7eb',
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '14px',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '8px 18px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};
