import { describe, it, expect } from 'vitest';
import { convertAssessmentFindingsToDraftTasks, AssessmentFindings } from '../assessment-to-tasks';

describe('convertAssessmentFindingsToDraftTasks', () => {
  it('converts ADL assistance findings into targeted care plan tasks', () => {
    const findings: AssessmentFindings = {
      adls: {
        bathing: 'assistance',
        dressing: 'dependent',
        toileting: 'assistance',
        transferring: 'assistance',
        feeding: 'independent',
      },
      state: 'FL',
    };

    const tasks = convertAssessmentFindingsToDraftTasks(findings);

    const bathingTask = tasks.find((t) => t.category === 'BATHING');
    expect(bathingTask).toBeDefined();
    expect(bathingTask?.name).toContain('Bathing');
    expect(bathingTask?.priority).toBe('HIGH');
    expect(bathingTask?.sourceFinding).toContain('Bathing');

    const dressingTask = tasks.find((t) => t.category === 'DRESSING');
    expect(dressingTask).toBeDefined();
    expect(dressingTask?.sourceFinding).toContain('dependent');

    const toiletingTask = tasks.find((t) => t.category === 'TOILETING');
    expect(toiletingTask).toBeDefined();

    const transferTask = tasks.find((t) => t.category === 'TRANSFERRING');
    expect(transferTask).toBeDefined();

    // Independent feeding should NOT generate a feeding task
    const feedingTask = tasks.find((t) => t.category === 'FEEDING');
    expect(feedingTask).toBeUndefined();
  });

  it('converts medications into an urgent medication reminder task', () => {
    const findings: AssessmentFindings = {
      medications: [
        { name: 'Lisinopril', dosage: '10mg', frequency: 'Daily' },
        { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily' },
      ],
      state: 'TX',
    };

    const tasks = convertAssessmentFindingsToDraftTasks(findings);
    const medTask = tasks.find((t) => t.category === 'MEDICATION');

    expect(medTask).toBeDefined();
    expect(medTask?.priority).toBe('URGENT');
    expect(medTask?.requiresSignature).toBe(true);
    expect(medTask?.instructions).toContain('Lisinopril');
    expect(medTask?.instructions).toContain('Metformin');
  });

  it('converts mobility impairment (walker/wheelchair/bedbound) correctly', () => {
    const walkerFindings: AssessmentFindings = { mobility: 'walker' };
    const walkerTasks = convertAssessmentFindingsToDraftTasks(walkerFindings);
    expect(walkerTasks.some((t) => t.name.includes('Walker'))).toBe(true);

    const bedboundFindings: AssessmentFindings = { mobility: 'bedbound' };
    const bedboundTasks = convertAssessmentFindingsToDraftTasks(bedboundFindings);
    const repositionTask = bedboundTasks.find((t) => t.name.includes('Turn & Position'));
    expect(repositionTask).toBeDefined();
    expect(repositionTask?.priority).toBe('URGENT');
  });

  it('always includes vital signs baseline monitoring and mandated supervisory visit oversight', () => {
    const findings: AssessmentFindings = {
      serviceTypes: ['Skilled Nursing'],
      state: 'FL',
    };

    const tasks = convertAssessmentFindingsToDraftTasks(findings);

    const vitalsTask = tasks.find((t) => t.name.includes('Vital Signs'));
    expect(vitalsTask).toBeDefined();

    const supervisionTask = tasks.find((t) => t.name.includes('Supervisory Visit'));
    expect(supervisionTask).toBeDefined();
    expect(supervisionTask?.instructions).toContain('Florida AHCA');
    expect(supervisionTask?.instructions).toContain('60');
  });
});
