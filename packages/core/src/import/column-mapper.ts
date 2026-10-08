/* eslint-disable max-lines */
/**
 * Column Mapper Utility
 *
 * Provides intelligent column mapping and auto-detection for CSV imports,
 * including pre-configured profiles for legacy home healthcare software:
 * - HHAeXchange
 * - ClearCare / WellSky
 * - Alora Healthcare
 */

export interface FieldDefinition {
  name: string;
  label: string;
  required: boolean;
  aliases: string[];
  description?: string;
  sample?: string;
}

export const CLIENT_IMPORT_FIELDS: FieldDefinition[] = [
  {
    name: 'client_number',
    label: 'Client Number / ID',
    required: false,
    aliases: ['client_number', 'client_id', 'client id', 'id', 'client #', 'mrn', 'patient_id', 'patient id', 'patient_no', 'chart_no', 'patient number', 'medicaid_id'],
    sample: 'C001',
  },
  {
    name: 'first_name',
    label: 'First Name',
    required: true,
    aliases: ['first_name', 'first name', 'firstname', 'first', 'client_first_name', 'patient_first_name', 'client first name', 'patient first'],
    sample: 'John',
  },
  {
    name: 'last_name',
    label: 'Last Name',
    required: true,
    aliases: ['last_name', 'last name', 'lastname', 'last', 'client_last_name', 'patient_last_name', 'client last name', 'patient last'],
    sample: 'Doe',
  },
  {
    name: 'middle_name',
    label: 'Middle Name',
    required: false,
    aliases: ['middle_name', 'middle name', 'middlename', 'middle', 'mi'],
    sample: 'A',
  },
  {
    name: 'preferred_name',
    label: 'Preferred / Nickname',
    required: false,
    aliases: ['preferred_name', 'preferred name', 'nickname', 'alias'],
    sample: 'Johnny',
  },
  {
    name: 'date_of_birth',
    label: 'Date of Birth',
    required: true,
    aliases: ['date_of_birth', 'date of birth', 'dob', 'birth_date', 'birthdate', 'birth date'],
    sample: '1950-01-15',
  },
  {
    name: 'gender',
    label: 'Gender / Sex',
    required: false,
    aliases: ['gender', 'sex', 'client_gender', 'patient_gender'],
    sample: 'MALE',
  },
  {
    name: 'ssn',
    label: 'SSN (Social Security)',
    required: false,
    aliases: ['ssn', 'social security', 'social_security', 'social security number', 'ssn_last_4'],
    sample: 'XXX-XX-1234',
  },
  {
    name: 'branch_id',
    label: 'Branch ID / Office',
    required: false,
    aliases: ['branch_id', 'branch', 'branch id', 'office', 'agency_branch', 'location', 'site'],
    sample: '00000000-0000-0000-0000-000000000000',
  },
  {
    name: 'address_line1',
    label: 'Address Line 1',
    required: true,
    aliases: ['address_line1', 'address_line_1', 'address line 1', 'street', 'street1', 'street address', 'address 1', 'address', 'addr1', 'address1'],
    sample: '123 Main St',
  },
  {
    name: 'address_line2',
    label: 'Address Line 2 (Apt/Suite)',
    required: false,
    aliases: ['address_line2', 'address_line_2', 'address line 2', 'street2', 'apt', 'suite', 'unit', 'address 2', 'addr2', 'address2'],
    sample: 'Apt 4B',
  },
  {
    name: 'address_city',
    label: 'City',
    required: true,
    aliases: ['address_city', 'city', 'town', 'municipality'],
    sample: 'Austin',
  },
  {
    name: 'address_state',
    label: 'State',
    required: true,
    aliases: ['address_state', 'state', 'st', 'province'],
    sample: 'TX',
  },
  {
    name: 'address_postal_code',
    label: 'Zip / Postal Code',
    required: true,
    aliases: ['address_postal_code', 'zip', 'zip_code', 'zipcode', 'zip code', 'postal code', 'postal_code'],
    sample: '78701',
  },
  {
    name: 'phone_number',
    label: 'Phone Number',
    required: false,
    aliases: ['phone_number', 'phone', 'phone number', 'primary_phone', 'primary phone', 'telephone', 'mobile', 'cell', 'home_phone'],
    sample: '512-555-1234',
  },
  {
    name: 'email',
    label: 'Email Address',
    required: false,
    aliases: ['email', 'email address', 'e-mail', 'client_email'],
    sample: 'client@example.com',
  },
  {
    name: 'status',
    label: 'Status',
    required: false,
    aliases: ['status', 'client_status', 'patient_status', 'active_status'],
    sample: 'ACTIVE',
  },
  {
    name: 'intake_date',
    label: 'Intake / Admission Date',
    required: false,
    aliases: ['intake_date', 'intake date', 'start_date', 'admission_date', 'admit_date', 'admit date'],
    sample: '2024-01-15',
  },
  {
    name: 'referral_source',
    label: 'Referral Source',
    required: false,
    aliases: ['referral_source', 'referral', 'referral source', 'source'],
    sample: 'Hospital Discharge',
  },
  {
    name: 'emergency_contact_name',
    label: 'Emergency Contact Name',
    required: false,
    aliases: ['emergency_contact_name', 'emergency contact name', 'emergency_contact', 'emergency contact', 'contact_name'],
    sample: 'Jane Doe',
  },
  {
    name: 'emergency_contact_phone',
    label: 'Emergency Contact Phone',
    required: false,
    aliases: ['emergency_contact_phone', 'emergency contact phone', 'emergency_phone', 'emergency phone'],
    sample: '512-555-5678',
  },
  {
    name: 'emergency_contact_relationship',
    label: 'Emergency Contact Relationship',
    required: false,
    aliases: ['emergency_contact_relationship', 'emergency contact relationship', 'relationship'],
    sample: 'Daughter',
  },
];

export const CAREGIVER_IMPORT_FIELDS: FieldDefinition[] = [
  {
    name: 'employee_number',
    label: 'Employee / Staff Number',
    required: false,
    aliases: ['employee_number', 'employee_id', 'employee id', 'staff_id', 'staff id', 'employee #', 'staff #', 'caregiver_id', 'caregiver id', 'aide_code', 'emp #'],
    sample: 'E001',
  },
  {
    name: 'first_name',
    label: 'First Name',
    required: true,
    aliases: ['first_name', 'first name', 'firstname', 'first', 'caregiver_first_name', 'caregiver first name'],
    sample: 'Maria',
  },
  {
    name: 'last_name',
    label: 'Last Name',
    required: true,
    aliases: ['last_name', 'last name', 'lastname', 'last', 'caregiver_last_name', 'caregiver last name'],
    sample: 'Garcia',
  },
  {
    name: 'middle_name',
    label: 'Middle Name',
    required: false,
    aliases: ['middle_name', 'middle name', 'middlename', 'middle', 'mi'],
    sample: 'Elena',
  },
  {
    name: 'date_of_birth',
    label: 'Date of Birth',
    required: true,
    aliases: ['date_of_birth', 'date of birth', 'dob', 'birth_date', 'birthdate', 'birth date'],
    sample: '1985-05-12',
  },
  {
    name: 'gender',
    label: 'Gender / Sex',
    required: false,
    aliases: ['gender', 'sex'],
    sample: 'FEMALE',
  },
  {
    name: 'ssn',
    label: 'SSN',
    required: false,
    aliases: ['ssn', 'social security', 'social_security', 'social security number'],
    sample: 'XXX-XX-5678',
  },
  {
    name: 'email',
    label: 'Email Address',
    required: true,
    aliases: ['email', 'email address', 'e-mail', 'caregiver_email', 'work_email'],
    sample: 'maria.garcia@folkcare.example',
  },
  {
    name: 'phone_number',
    label: 'Phone Number',
    required: false,
    aliases: ['phone_number', 'phone', 'phone number', 'primary_phone', 'mobile', 'cell', 'telephone'],
    sample: '512-555-7777',
  },
  {
    name: 'primary_branch_id',
    label: 'Branch ID / Location',
    required: false,
    aliases: ['primary_branch_id', 'branch_id', 'branch', 'location', 'office'],
    sample: '00000000-0000-0000-0000-000000000000',
  },
  {
    name: 'address_line1',
    label: 'Address Line 1',
    required: true,
    aliases: ['address_line1', 'address_line_1', 'address line 1', 'street', 'street1', 'address', 'address 1'],
    sample: '100 Main St',
  },
  {
    name: 'address_line2',
    label: 'Address Line 2',
    required: false,
    aliases: ['address_line2', 'address_line_2', 'address line 2', 'street2', 'apt', 'suite', 'address 2'],
    sample: 'Suite 200',
  },
  {
    name: 'address_city',
    label: 'City',
    required: true,
    aliases: ['address_city', 'city', 'town'],
    sample: 'Austin',
  },
  {
    name: 'address_state',
    label: 'State',
    required: true,
    aliases: ['address_state', 'state', 'st'],
    sample: 'TX',
  },
  {
    name: 'address_postal_code',
    label: 'Zip / Postal Code',
    required: true,
    aliases: ['address_postal_code', 'zip', 'zip_code', 'zipcode', 'zip code', 'postal_code'],
    sample: '78701',
  },
  {
    name: 'hire_date',
    label: 'Hire Date',
    required: true,
    aliases: ['hire_date', 'hire date', 'start_date', 'date_of_hire', 'employment_date'],
    sample: '2023-01-15',
  },
  {
    name: 'employment_type',
    label: 'Employment Type',
    required: true,
    aliases: ['employment_type', 'employment type', 'emp_type', 'type', 'full_part_time'],
    sample: 'FULL_TIME',
  },
  {
    name: 'role',
    label: 'Role / Position',
    required: true,
    aliases: ['role', 'job_title', 'title', 'position', 'job_code', 'discipline'],
    sample: 'CAREGIVER',
  },
  {
    name: 'employment_status',
    label: 'Employment Status',
    required: false,
    aliases: ['employment_status', 'employment status', 'status', 'work_status'],
    sample: 'ACTIVE',
  },
  {
    name: 'pay_rate_amount',
    label: 'Hourly Pay Rate ($)',
    required: false,
    aliases: ['pay_rate_amount', 'pay_rate', 'hourly_rate', 'pay rate', 'rate', 'hourly pay', 'wage'],
    sample: '18.50',
  },
  {
    name: 'skills',
    label: 'Skills (pipe or semicolon separated)',
    required: false,
    aliases: ['skills', 'competencies', 'caregiver_skills'],
    sample: 'CPR|Patient Mobility|Personal Care',
  },
  {
    name: 'specializations',
    label: 'Certifications / Specializations',
    required: false,
    aliases: ['specializations', 'certifications', 'credentials', 'licenses'],
    sample: 'CNA|CPR|First Aid',
  },
  {
    name: 'emergency_contact_name',
    label: 'Emergency Contact Name',
    required: false,
    aliases: ['emergency_contact_name', 'emergency_contact', 'emergency contact'],
    sample: 'Carlos Garcia',
  },
  {
    name: 'emergency_contact_phone',
    label: 'Emergency Contact Phone',
    required: false,
    aliases: ['emergency_contact_phone', 'emergency_phone', 'emergency phone'],
    sample: '512-555-7778',
  },
];

/**
 * Normalize a column header for matching
 */
export function normalizeColumnHeader(header: string): string {
  let cleaned = header
    .trim()
    .toLowerCase()
    .replace(/[^\da-z]/g, '_')
    .replace(/_+/g, '_');
  if (cleaned.startsWith('_')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.endsWith('_')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Detect column mappings based on CSV headers and target field definitions
 */
export function detectColumnMappings(
  csvHeaders: string[],
  entityType: 'clients' | 'caregivers'
): Record<string, string> {
  const fields = entityType === 'clients' ? CLIENT_IMPORT_FIELDS : CAREGIVER_IMPORT_FIELDS;
  const mappings: Record<string, string> = {};
  const mappedFields = new Set<string>();

  for (const rawHeader of csvHeaders) {
    const normalized = normalizeColumnHeader(rawHeader);
    const rawLower = rawHeader.trim().toLowerCase();

    // 1. Direct match with field name
    let matchedField = fields.find((f) => f.name === normalized || f.name === rawLower);

    // 2. Exact match with an alias
    matchedField ??= fields.find((f) =>
      f.aliases.some((alias) => normalizeColumnHeader(alias) === normalized || alias.toLowerCase() === rawLower)
    );

    // 3. Substring heuristic (if not already mapped)
    matchedField ??= fields.find((f) =>
      !mappedFields.has(f.name) &&
      f.aliases.some((alias) => {
        const normAlias = normalizeColumnHeader(alias);
        return normalized.includes(normAlias) || normAlias.includes(normalized);
      })
    );

    if (matchedField !== undefined && !mappedFields.has(matchedField.name)) {
      // eslint-disable-next-line security/detect-object-injection
      mappings[rawHeader] = matchedField.name;
      mappedFields.add(matchedField.name);
    }
  }

  return mappings;
}

/**
 * Apply column mappings to an arbitrary CSV row
 */
export function applyColumnMapping(
  row: Record<string, unknown>,
  mappings: Record<string, string>
): Record<string, string> {
  const mappedRow: Record<string, string> = {};

  for (const [csvCol, val] of Object.entries(row)) {
    // eslint-disable-next-line security/detect-object-injection
    const targetField = mappings[csvCol] ?? mappings[csvCol.trim()];
    if (targetField !== undefined && targetField !== '' && val !== null && val !== undefined) {
      // eslint-disable-next-line security/detect-object-injection
      mappedRow[targetField] = String(val).trim();
    }
  }

  return mappedRow;
}
