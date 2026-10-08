import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useCaregivers } from '@/verticals/caregivers/hooks/useCaregivers';
import { useCalendarVisits, useVisitApi } from '@/verticals/scheduling-visits/hooks/useVisits';
import type { Visit as ApiVisit } from '@/verticals/scheduling-visits/types';

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

  const queryClient = useQueryClient();
  const visitApi = useVisitApi();

  const weekDates = useMemo(() => getNextWeekDates(), []);

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

  // Availability data isn't modeled by the caregiver API; treat all caregivers
  // as available. Occupied slots are still computed from real visit data.
  const getCaregiverAvailability = (_caregiverId: string) => true;

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
        </div>
      </div>

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
                              <strong>{visit.clientName}</strong>
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
};
