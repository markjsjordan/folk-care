const { CaregiverValidator } = require("/Users/markjordan/folk-care/verticals/caregiver-staff/dist/validation/caregiver-validator.js");

const input = {
  organizationId: "00000000-0000-0000-0000-000000000001",
  branchIds: ["00000000-0000-0000-0000-000000000002"],
  primaryBranchId: "00000000-0000-0000-0000-000000000002",
  firstName: "Jane",
  lastName: "Doe",
  dateOfBirth: new Date("1990-05-15"),
  email: "jane.test@example.com",
  primaryPhone: { number: "5551234567", type: "MOBILE", canReceiveSMS: true, isPrimary: true },
  primaryAddress: { type: "HOME", line1: "123 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
  emergencyContacts: [
    { id: "11111111-1111-1111-1111-111111111111", name: "John Doe", relationship: "Spouse", phone: { number: "5559876543", type: "MOBILE", canReceiveSMS: true }, isPrimary: true }
  ],
  employmentType: "FULL_TIME",
  hireDate: new Date("2024-01-10"),
  role: "CAREGIVER",
  payRate: { id: "22222222-2222-2222-2222-222222222222", rateType: "BASE", amount: 22.5, unit: "HOURLY", effectiveDate: new Date("2024-01-10") },
  status: "ACTIVE",
};

const validator = new CaregiverValidator();
const result = validator.validateCreate(input);
console.log(JSON.stringify(result, null, 2));
