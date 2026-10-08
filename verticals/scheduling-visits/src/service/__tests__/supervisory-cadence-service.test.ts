import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import {
  calculateSupervisoryCadence,
  SupervisoryCadenceService,
  isSkilledCare,
} from '../supervisory-cadence-service.js';

describe('Supervisory Visit Cadence Engine', () => {
  const service = new SupervisoryCadenceService();
  // Fixed reference date: 2026-06-01
  const fixedReferenceDate = '2026-06-01';

  describe('isSkilledCare helper', () => {
    it('identifies skilled care when isSkilledNursing is explicitly true', () => {
      expect(isSkilledCare(true)).toBe(true);
      expect(isSkilledCare(false)).toBe(false);
    });

    it('identifies skilled care from serviceType string', () => {
      expect(isSkilledCare(undefined, 'Skilled Nursing Visit')).toBe(true);
      expect(isSkilledCare(undefined, 'RN Assessment')).toBe(true);
      expect(isSkilledCare(undefined, 'LPN Wound Care')).toBe(true);
      expect(isSkilledCare(undefined, 'Clinical Infusion')).toBe(true);
      expect(isSkilledCare(undefined, 'Personal Care')).toBe(false);
      expect(isSkilledCare(undefined, 'Companion Support')).toBe(false);
    });

    it('identifies skilled care from clinical acuityLevel', () => {
      expect(isSkilledCare(undefined, undefined, 'HIGH')).toBe(true);
      expect(isSkilledCare(undefined, undefined, 'COMPLEX')).toBe(true);
      expect(isSkilledCare(undefined, undefined, 'MODERATE')).toBe(false);
      expect(isSkilledCare(undefined, undefined, 'LOW')).toBe(false);
    });
  });

  describe('Florida AHCA Chapter 59A-8 60-Day Skilled Nursing Cadence', () => {
    it('calculates exactly 60 days cadence for Florida skilled nursing client', () => {
      // Anchor date: 2026-04-02 (exactly 60 days before 2026-06-01: April has 30 days -> 28 days + 31 days in May + 1 day = 60 days)
      const lastSupervision = '2026-04-02';

      const result = service.calculateCadence({
        clientId: 'client-fl-1',
        state: 'FL',
        isSkilledNursing: true,
        lastSupervisoryVisitDate: lastSupervision,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(60);
      expect(result.isSkilled).toBe(true);
      expect(result.daysRemaining).toBe(0); // Due today
      expect(result.status).toBe('UPCOMING'); // Due today is within 14 days
      expect(result.showAlert).toBe(true);
      expect(result.regulationCitation).toContain('Florida AHCA');
      expect(result.regulationCitation).toContain('60-day');
      expect(format(result.dueDate, 'yyyy-MM-dd')).toBe('2026-06-01');
    });

    it('flags OVERDUE when skilled visit exceeds 60 days in Florida', () => {
      // Anchor date: 2026-03-15 (78 days ago => 18 days overdue)
      const lastSupervision = '2026-03-15';

      const result = service.calculateCadence({
        clientId: 'client-fl-overdue',
        state: 'FL',
        serviceType: 'Skilled Nursing',
        lastSupervisoryVisitDate: lastSupervision,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(60);
      expect(result.isOverdue).toBe(true);
      expect(result.status).toBe('OVERDUE');
      expect(result.daysRemaining).toBeLessThan(0);
      expect(result.alertSeverity).toBe('danger');
      expect(result.alertTitle).toContain('Overdue');
      expect(result.alertMessage).toContain('Florida AHCA');
    });

    it('flags UPCOMING when skilled visit is due within 14 days in Florida', () => {
      // Anchor date: 2026-04-10 (52 days ago => due in 8 days)
      const lastSupervision = '2026-04-10';

      const result = service.calculateCadence({
        clientId: 'client-fl-upcoming',
        state: 'FL',
        isSkilledNursing: true,
        lastSupervisoryVisitDate: lastSupervision,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(60);
      expect(result.isUpcoming).toBe(true);
      expect(result.isOverdue).toBe(false);
      expect(result.status).toBe('UPCOMING');
      expect(result.daysRemaining).toBe(8);
      expect(result.alertSeverity).toBe('warning');
      expect(result.showAlert).toBe(true);
      expect(result.alertTitle).toContain('Due Soon');
    });

    it('reports OK when skilled visit is more than 14 days away', () => {
      // Anchor date: 2026-05-15 (17 days ago => due in 43 days)
      const lastSupervision = '2026-05-15';

      const result = service.calculateCadence({
        clientId: 'client-fl-ok',
        state: 'FL',
        isSkilledNursing: true,
        lastSupervisoryVisitDate: lastSupervision,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(60);
      expect(result.status).toBe('OK');
      expect(result.showAlert).toBe(false);
      expect(result.isOverdue).toBe(false);
      expect(result.isUpcoming).toBe(false);
      expect(result.daysRemaining).toBe(43);
    });
  });

  describe('Texas HHSC 26 TAC §558 60-Day Skilled Nursing Cadence', () => {
    it('calculates 60-day cadence for Texas skilled nursing client', () => {
      // Anchor date: 2026-04-15 => +60 days = 2026-06-14 => 13 days remaining => UPCOMING
      const initialVisit = '2026-04-15';

      const result = calculateSupervisoryCadence({
        clientId: 'client-tx-skilled',
        state: 'TX',
        acuityLevel: 'HIGH',
        initialVisitDate: initialVisit,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(60);
      expect(result.isSkilled).toBe(true);
      expect(result.regulationCitation).toContain('Texas HHSC 26 TAC §558');
      expect(result.regulationCitation).toContain('60-day');
      expect(result.daysRemaining).toBe(13);
      expect(result.status).toBe('UPCOMING');
      expect(result.showAlert).toBe(true);
      expect(result.alertSeverity).toBe('warning');
    });

    it('flags OVERDUE for Texas skilled nursing client past 60 days', () => {
      const intakeDate = '2026-03-01';

      const result = calculateSupervisoryCadence({
        clientId: 'client-tx-overdue',
        state: 'TX',
        serviceType: 'Skilled Nursing',
        intakeDate,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(60);
      expect(result.status).toBe('OVERDUE');
      expect(result.isOverdue).toBe(true);
      expect(result.alertSeverity).toBe('danger');
      expect(result.alertMessage).toContain('Texas HHSC 26 TAC §558');
    });
  });

  describe('Non-Skilled Personal Care 90-120 Day Cadence', () => {
    it('defaults to 90 days for Florida personal care client', () => {
      // 2026-03-03 + 90 days = 2026-06-01 (Due today => 0 days remaining)
      const lastSupervision = '2026-03-03';

      const result = service.calculateCadence({
        clientId: 'client-fl-pc',
        state: 'FL',
        isSkilledNursing: false,
        serviceType: 'Personal Care Assistance',
        acuityLevel: 'LOW',
        lastSupervisoryVisitDate: lastSupervision,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(90);
      expect(result.isSkilled).toBe(false);
      expect(result.daysRemaining).toBe(0);
      expect(result.status).toBe('UPCOMING');
      expect(result.showAlert).toBe(true);
      expect(result.regulationCitation).toContain('Florida AHCA');
      expect(result.regulationCitation).toContain('90-120 days');
    });

    it('defaults to 90 days for Texas non-skilled personal care client', () => {
      const initialVisit = '2026-03-03';

      const result = calculateSupervisoryCadence({
        clientId: 'client-tx-pc',
        state: 'TX',
        serviceType: 'Companion Care',
        acuityLevel: 'MODERATE',
        initialVisitDate: initialVisit,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(90);
      expect(result.isSkilled).toBe(false);
      expect(result.regulationCitation).toContain('Texas HHSC 26 TAC §558');
    });

    it('supports custom non-skilled cadence within the 90-120 day allowable window', () => {
      const anchorDate = '2026-02-01';

      const result120 = calculateSupervisoryCadence({
        clientId: 'client-120',
        state: 'TX',
        isSkilledNursing: false,
        preferredNonSkilledCadenceDays: 120,
        lastSupervisoryVisitDate: anchorDate,
        referenceDate: fixedReferenceDate,
      });

      expect(result120.cadenceDays).toBe(120);

      // Clamps under 90 to 90
      const resultUnder = calculateSupervisoryCadence({
        clientId: 'client-under',
        state: 'TX',
        isSkilledNursing: false,
        preferredNonSkilledCadenceDays: 45,
        lastSupervisoryVisitDate: anchorDate,
        referenceDate: fixedReferenceDate,
      });
      expect(resultUnder.cadenceDays).toBe(90);

      // Clamps over 120 to 120
      const resultOver = calculateSupervisoryCadence({
        clientId: 'client-over',
        state: 'TX',
        isSkilledNursing: false,
        preferredNonSkilledCadenceDays: 180,
        lastSupervisoryVisitDate: anchorDate,
        referenceDate: fixedReferenceDate,
      });
      expect(resultOver.cadenceDays).toBe(120);
    });

    it('flags OVERDUE when personal care exceeds 90 days', () => {
      const anchorDate = '2026-01-01';

      const result = calculateSupervisoryCadence({
        clientId: 'client-pc-overdue',
        state: 'FL',
        isSkilledNursing: false,
        serviceType: 'Personal Care',
        lastSupervisoryVisitDate: anchorDate,
        referenceDate: fixedReferenceDate,
      });

      expect(result.cadenceDays).toBe(90);
      expect(result.status).toBe('OVERDUE');
      expect(result.isOverdue).toBe(true);
      expect(result.showAlert).toBe(true);
      expect(result.alertSeverity).toBe('danger');
    });
  });

  describe('Service methods', () => {
    it('isVisitDueOrUpcoming returns true for overdue or upcoming visits', () => {
      const overdue = service.isVisitDueOrUpcoming({
        state: 'FL',
        isSkilledNursing: true,
        lastSupervisoryVisitDate: '2026-01-01',
        referenceDate: fixedReferenceDate,
      });
      expect(overdue).toBe(true);

      const ok = service.isVisitDueOrUpcoming({
        state: 'FL',
        isSkilledNursing: true,
        lastSupervisoryVisitDate: '2026-05-25',
        referenceDate: fixedReferenceDate,
      });
      expect(ok).toBe(false);
    });

    it('getNextDueDate returns correct Date object', () => {
      const anchor = '2026-04-01';
      const nextDue = service.getNextDueDate({
        state: 'TX',
        isSkilledNursing: true,
        lastSupervisoryVisitDate: anchor,
        referenceDate: fixedReferenceDate,
      });

      expect(nextDue instanceof Date).toBe(true);
      // 2026-04-01 + 60 days = 2026-05-31
      expect(format(nextDue, 'yyyy-MM-dd')).toBe('2026-05-31');
    });
  });
});
