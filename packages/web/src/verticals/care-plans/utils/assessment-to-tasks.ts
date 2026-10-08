/**
 * Conversion of Intake Assessment Findings into Draft Care Plan Tasks
 *
 * Implements the automated synthesis of clinical and functional findings
 * from initial nursing intake assessments into structured, actionable Care Plan tasks.
 */

import type { TaskCategory } from '../types/care-plan';

export type FunctionalIndependenceLevel = 'independent' | 'assistance' | 'dependent';

export interface AssessmentFindings {
  adls?: {
    bathing?: FunctionalIndependenceLevel;
    dressing?: FunctionalIndependenceLevel;
    toileting?: FunctionalIndependenceLevel;
    transferring?: FunctionalIndependenceLevel;
    feeding?: FunctionalIndependenceLevel;
  };
  iadls?: {
    housekeeping?: FunctionalIndependenceLevel;
    laundry?: FunctionalIndependenceLevel;
    mealPrep?: FunctionalIndependenceLevel;
    medication?: FunctionalIndependenceLevel;
    transportation?: FunctionalIndependenceLevel;
  };
  mobility?: 'ambulatory' | 'walker' | 'wheelchair' | 'bedbound' | string;
  cognitive?: 'normal' | 'mild' | 'moderate' | 'severe' | string;
  medications?: Array<{ name: string; dosage?: string; frequency?: string }>;
  allergies?: string[];
  conditions?: string[];
  vitalSignsRequired?: boolean;
  serviceTypes?: string[];
  state?: string;
  goals?: string;
}

export interface DraftCarePlanTask {
  id: string;
  name: string;
  category: TaskCategory;
  description: string;
  instructions: string;
  frequency: string;
  estimatedDurationMinutes: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  requiresSignature: boolean;
  requiresNote: boolean;
  sourceFinding: string;
  status: 'DRAFT';
}

/**
 * Converts intake assessment findings into draft Care Plan tasks
 */
export function convertAssessmentFindingsToDraftTasks(
  findings: AssessmentFindings
): DraftCarePlanTask[] {
  const tasks: DraftCarePlanTask[] = [];

  const add = (
    name: string,
    category: TaskCategory,
    description: string,
    instructions: string,
    frequency: string,
    estimatedDurationMinutes: number,
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
    requiresSignature: boolean,
    requiresNote: boolean,
    sourceFinding: string
  ) => {
    tasks.push({
      id: `draft-task-${crypto.randomUUID()}`,
      name,
      category,
      description,
      instructions,
      frequency,
      estimatedDurationMinutes,
      priority,
      requiresSignature,
      requiresNote,
      sourceFinding,
      status: 'DRAFT',
    });
  };

  // 1. ADL: Bathing
  const bathingLevel = findings.adls?.bathing;
  if (bathingLevel === 'assistance' || bathingLevel === 'dependent') {
    add(
      'Shower & Bathing Assistance',
      'BATHING',
      'Assist client with bathing, personal hygiene, and water temperature safety.',
      'Prepare bath/shower area with non-slip mats. Check water temperature (max 100°F). Assist client in and out of shower. Provide assistance with washing back, lower extremities, and hair. Never leave client unattended.',
      'Daily / Per Scheduled Visit',
      30,
      'HIGH',
      false,
      true,
      `ADL Assessment: Bathing (${bathingLevel})`
    );
  }

  // 2. ADL: Dressing
  const dressingLevel = findings.adls?.dressing;
  if (dressingLevel === 'assistance' || dressingLevel === 'dependent') {
    add(
      'Dressing & Grooming Assistance',
      'DRESSING',
      'Assist client with choosing weather-appropriate clothing and dressing routine.',
      'Assist with upper and lower body garments. Ensure non-skid socks or supportive shoes are worn. Encourage self-dressing where appropriate to maintain functional independence.',
      'Daily / Morning Visit',
      20,
      'MEDIUM',
      false,
      false,
      `ADL Assessment: Dressing (${dressingLevel})`
    );
  }

  // 3. ADL: Toileting
  const toiletingLevel = findings.adls?.toileting;
  if (toiletingLevel === 'assistance' || toiletingLevel === 'dependent') {
    add(
      'Toileting & Perineal Hygiene Assistance',
      'TOILETING',
      'Assist with bathroom transfers, personal hygiene, and incontinence management.',
      'Assist client to/from toilet or commode with prompt transfer technique. Ensure perineal hygiene and skin dryness. Check incontinence supplies and change promptly.',
      'Per Visit Routine',
      20,
      'HIGH',
      false,
      true,
      `ADL Assessment: Toileting (${toiletingLevel})`
    );
  }

  // 4. ADL: Transferring
  const transferringLevel = findings.adls?.transferring;
  if (transferringLevel === 'assistance' || transferringLevel === 'dependent') {
    add(
      'Safe Transfer & Gait Assistance',
      'TRANSFERRING',
      'Provide transfer assistance between bed, chair, and wheelchair.',
      'Apply gait belt prior to standing. Ensure non-skid footwear. Lock wheelchair or commode brakes before beginning transfer. Practice proper body mechanics.',
      'Every Visit',
      15,
      'HIGH',
      false,
      false,
      `ADL Assessment: Transferring (${transferringLevel})`
    );
  }

  // 5. ADL: Feeding
  const feedingLevel = findings.adls?.feeding;
  if (feedingLevel === 'assistance' || feedingLevel === 'dependent') {
    add(
      'Meal Setup & Feeding Assistance',
      'FEEDING',
      'Assist client with eating meals and maintaining adequate oral hydration.',
      'Position client upright at 90 degrees. Cut food into bite-sized portions. Monitor swallow safety and encourage sips of fluids between bites. Document intake percentage.',
      'Mealtime Visits',
      30,
      'HIGH',
      false,
      true,
      `ADL Assessment: Feeding (${feedingLevel})`
    );
  }

  // 6. IADL: Housekeeping
  const housekeepingLevel = findings.iadls?.housekeeping;
  if (housekeepingLevel === 'assistance' || housekeepingLevel === 'dependent') {
    add(
      'Light Housekeeping & Hazard Mitigation',
      'HOUSEKEEPING',
      'Maintain clean and hazard-free living areas to prevent fall risks.',
      'Clear transit pathways of throw rugs, cords, and clutter. Sanitize bathroom surfaces. Take out daily kitchen and bathroom trash.',
      '2-3x per Week',
      45,
      'LOW',
      false,
      false,
      `IADL Assessment: Housekeeping (${housekeepingLevel})`
    );
  }

  // 7. IADL: Laundry
  const laundryLevel = findings.iadls?.laundry;
  if (laundryLevel === 'assistance' || laundryLevel === 'dependent') {
    add(
      'Laundry & Linen Care',
      'LAUNDRY',
      'Wash, dry, fold, and put away client clothing and bed linens.',
      'Change bed linens weekly. Wash client laundry with skin-sensitive detergent. Fold and return to closet/drawers.',
      'Weekly',
      40,
      'LOW',
      false,
      false,
      `IADL Assessment: Laundry (${laundryLevel})`
    );
  }

  // 8. IADL: Meal Prep
  const mealPrepLevel = findings.iadls?.mealPrep;
  if (mealPrepLevel === 'assistance' || mealPrepLevel === 'dependent') {
    add(
      'Nutritious Meal Preparation',
      'MEAL_PREPARATION',
      'Prepare balanced meals adhering to client dietary plan and restrictions.',
      'Prepare wholesome meals following prescribed dietary guidelines (low sodium/diabetic). Store leftovers in dated sealed containers in refrigerator.',
      'Daily / Meal Visits',
      45,
      'MEDIUM',
      false,
      false,
      `IADL Assessment: Meal Prep (${mealPrepLevel})`
    );
  }

  // 9. IADL: Medication
  const medLevel = findings.iadls?.medication;
  const hasMeds = (findings.medications && findings.medications.length > 0) || false;
  if (medLevel === 'assistance' || medLevel === 'dependent' || hasMeds) {
    const medSummary = hasMeds
      ? findings.medications!.map((m) => `${m.name} (${m.dosage || 'prescribed dose'})`).join(', ')
      : 'Prescribed medication regimen';

    add(
      'Medication Reminders & Reconciliation',
      'MEDICATION',
      'Prompt client to self-administer prescribed medications per dosage schedule.',
      `Remind client to take medications (${medSummary}). Observe client taking medications with water/food. Document administration time and report any refusals to coordinator.`,
      'Every Visit (Scheduled Times)',
      15,
      'URGENT',
      true,
      true,
      `IADL / Clinical Assessment: Medications (${hasMeds ? `${findings.medications!.length} active meds` : medLevel})`
    );
  }

  // 10. IADL: Transportation
  const transLevel = findings.iadls?.transportation;
  if (transLevel === 'assistance' || transLevel === 'dependent') {
    add(
      'Medical Appointment Escort & Transportation',
      'TRANSPORTATION',
      'Accompany client on essential physician visits and pharmacy errands.',
      'Assist client safely in and out of vehicle. Escort into appointment reception and remain available. Maintain documentation of appointment visit.',
      'As Scheduled',
      60,
      'MEDIUM',
      false,
      false,
      `IADL Assessment: Transportation (${transLevel})`
    );
  }

  // 11. Mobility Assessment
  if (findings.mobility === 'walker') {
    add(
      'Walker Ambulation & Fall Prevention',
      'AMBULATION',
      'Support safe ambulation using rolling walker and observe gait stability.',
      'Ensure walker tips/wheels are secure. Walk slightly behind and to the weaker side of client. Remind client to step into walker and not push it too far ahead.',
      'Every Visit',
      20,
      'HIGH',
      false,
      false,
      'Mobility Assessment: Uses Walker'
    );
  } else if (findings.mobility === 'wheelchair') {
    add(
      'Wheelchair Mobility & Pressure Relief',
      'MOBILITY',
      'Assist with wheelchair navigation and periodic pressure relief.',
      'Lock brakes during all transfers. Prompt weight shifts every 60 minutes while seated to prevent pressure injury.',
      'Every Visit',
      20,
      'HIGH',
      false,
      false,
      'Mobility Assessment: Wheelchair bound'
    );
  } else if (findings.mobility === 'bedbound') {
    add(
      'Turn & Position Routine (Skin Breakdown Prevention)',
      'MOBILITY',
      'Reposition bedbound client every 2 hours and inspect skin integrity.',
      'Turn client every 2 hours using pillows for lateral support. Inspect sacrum, heels, and hips for erythema or skin breakdown. Report any redness immediately.',
      'Every 2 Hours (Bedbound)',
      25,
      'URGENT',
      true,
      true,
      'Mobility Assessment: Bedbound'
    );
  }

  // 12. Cognitive Assessment
  if (findings.cognitive === 'mild' || findings.cognitive === 'moderate' || findings.cognitive === 'severe') {
    add(
      'Cognitive Support & Wandering Monitoring',
      'MONITORING',
      'Provide structured daily routine, gentle orientation, and wandering safety oversight.',
      'Maintain predictable routine. Use clear, calm communication. Ensure home exits are secure to prevent disorientation wandering. Provide familiar orientation cues.',
      'Continuous During Visits',
      30,
      'HIGH',
      false,
      true,
      `Cognitive Assessment: ${findings.cognitive.toUpperCase()} impairment`
    );
  }

  // 13. Baseline Vital Signs Monitoring (Standard for initial visit intake)
  add(
    'Daily Vital Signs Monitoring',
    'MONITORING',
    'Measure and record baseline blood pressure, heart rate, respiration, and temperature.',
    'Obtain vital signs in seated resting position. Document exact systolic/diastolic, pulse, and O2 saturation. Notify supervising nurse if BP > 160/90 or pulse < 50 or > 100.',
    'Every Visit / Shift Start',
    15,
    'HIGH',
    false,
    true,
    'Clinical Protocol: Baseline Vital Signs Requirement'
  );

  // 14. Mandated Supervisory Visit Cadence Task
  const stateCode = (findings.state || 'FL').toUpperCase();
  const isSkilled =
    findings.serviceTypes?.some((t) => t.toLowerCase().includes('skilled') || t.toLowerCase().includes('nursing')) ??
    (findings.conditions && findings.conditions.length > 2);
  const cadenceDays = isSkilled ? 60 : 90;
  const citation =
    stateCode === 'FL'
      ? 'Florida AHCA Ch. 59A-8.0095'
      : stateCode === 'TX'
      ? 'Texas HHSC 26 TAC §558'
      : 'State Licensure Home Health Standards';

  add(
    `RN Supervisory Visit Oversight (${cadenceDays}-Day Cadence)`,
    'DOCUMENTATION',
    `Conduct recurring supervisory evaluation every ${cadenceDays} days pursuant to ${citation}.`,
    `Supervising RN must evaluate caregiver care delivery, review client plan of care, assess satisfaction, and document supervisory findings every ${cadenceDays} days per ${citation}.`,
    `Every ${cadenceDays} Days`,
    60,
    'HIGH',
    true,
    true,
    `Regulatory Compliance: ${citation} (${cadenceDays}-Day Cadence)`
  );

  return tasks;
}
