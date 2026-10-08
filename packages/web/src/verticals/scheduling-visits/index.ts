/**
 * Scheduling & Visits Vertical - Web UI
 */

// Pages
export { VisitList, CalendarView } from './pages';

// Components
export { VisitCard } from './components';

// Hooks
export { useVisits, useVisit, useMyVisits, useVisitApi, useCalendarVisits, useCaregiverAvailability } from './hooks/useVisits';


// Configuration
export { VISIT_TYPES, getVisitTypeConfig } from './config/visitTypeConfig';
export type { VisitTypeConfig } from './config/visitTypeConfig';

// Types
export type {
  Visit,
  VisitSearchFilters,
  VisitStatus,
  VisitType,
  VisitAddress,
} from './types';

