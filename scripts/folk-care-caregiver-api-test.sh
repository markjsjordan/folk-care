#!/bin/bash
# Test script to verify caregiver API response structure

# This script tests the GET /api/caregivers/:id endpoint with a sample caregiver

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== CaregiverDetail API Response Test ===${NC}\n"

# Step 1: Get a sample caregiver ID from database
echo -e "${YELLOW}Step 1: Finding sample caregiver from database...${NC}"

# Note: This requires psql and DATABASE_URL to be set
# For now, we'll use a hardcoded ID that should exist in demo data

# Sample caregiver IDs from folk-care demo data (if they exist)
SAMPLE_IDS=(
  "demo-caregiver-1"
  "demo-caregiver-2"
  "caregiver-001"
)

echo "Sample caregiver IDs to try: ${SAMPLE_IDS[@]}"
echo ""

# Step 2: Test with a sample ID
echo -e "${YELLOW}Step 2: Testing API endpoint structure...${NC}"
echo ""

echo "Expected API Response Structure:"
cat <<'EOF'
{
  "id": "string",
  "organizationId": "string",
  "branchIds": ["string"],
  "primaryBranchId": "string",
  "employeeNumber": "string",
  "firstName": "string",
  "middleName": "string | null",
  "lastName": "string",
  "preferredName": "string | null",
  "dateOfBirth": "ISO 8601 string (e.g., '1985-03-15T00:00:00.000Z')",
  "email": "string",
  "primaryPhone": {
    "number": "string",
    "type": "MOBILE | HOME | WORK",
    "canReceiveSMS": boolean
  },
  "employmentType": "FULL_TIME | PART_TIME | PER_DIEM | CONTRACT | TEMPORARY | SEASONAL",
  "employmentStatus": "ACTIVE | ON_LEAVE | SUSPENDED | TERMINATED | RETIRED",
  "hireDate": "ISO 8601 string",
  "role": "string",
  "status": "APPLICATION | INTERVIEWING | PENDING_ONBOARDING | ONBOARDING | ACTIVE | INACTIVE | ON_LEAVE | SUSPENDED | TERMINATED | RETIRED",
  "complianceStatus": "COMPLIANT | PENDING_VERIFICATION | EXPIRING_SOON | EXPIRED | NON_COMPLIANT",
  "credentials": [
    {
      "id": "string",
      "type": "string",
      "name": "string",
      "number": "string | null",
      "issueDate": "ISO 8601 string",
      "expirationDate": "ISO 8601 string | null",
      "status": "ACTIVE | EXPIRED | PENDING_VERIFICATION | REVOKED"
    }
  ],
  "training": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "completionDate": "ISO 8601 string",
      "expirationDate": "ISO 8601 string | null",
      "status": "COMPLETED | EXPIRED | IN_PROGRESS"
    }
  ],
  "isDemoData": boolean,
  "createdAt": "ISO 8601 string",
  "updatedAt": "ISO 8601 string"
}
EOF

echo ""
echo -e "${YELLOW}Step 3: Key Points for Frontend Implementation:${NC}"
cat <<'EOF'

1. DATE FIELDS:
   - dateOfBirth, hireDate, credentials[].issueDate, credentials[].expirationDate
   - training[].completionDate, training[].expirationDate
   - createdAt, updatedAt
   ALL are ISO 8601 strings in JSON, NOT JavaScript Date objects
   MUST parse with: new Date(string) or use formatDate() utility

2. OPTIONAL FIELDS:
   - middleName (can be null)
   - preferredName (can be null)
   - primaryPhone (required in type, verify at runtime)
   - credentials[].number (can be null)
   - credentials[].expirationDate (can be null)
   - training[].expirationDate (can be null)

3. NESTED OBJECT ACCESS:
   - Must check primaryPhone exists before accessing .number, .type, .canReceiveSMS
   - Must check credentials array exists before .map()
   - Must check training array exists before .map()
   - Sample safe access:
     {caregiver?.primaryPhone?.number && formatPhone(caregiver.primaryPhone.number)}

4. ARRAY FIELDS:
   - credentials: Credential[] - might be [] (empty) or undefined
   - training: TrainingRecord[] - might be [] (empty) or undefined
   - branchIds: string[] - always present but might be []

5. STATUS ENUMS:
   - status: APPLICATION, INTERVIEWING, PENDING_ONBOARDING, ONBOARDING, ACTIVE, INACTIVE, ON_LEAVE, SUSPENDED, TERMINATED, RETIRED
   - complianceStatus: COMPLIANT, PENDING_VERIFICATION, EXPIRING_SOON, EXPIRED, NON_COMPLIANT
   - employmentStatus: ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED, RETIRED
   - employmentType: FULL_TIME, PART_TIME, PER_DIEM, CONTRACT, TEMPORARY, SEASONAL

6. PAYRATE (Not in basic response):
   - The API routes mention payRate in POST/PATCH
   - Verify if payRate is included in GET response or separate endpoint
   - May need to fetch separately if not included

EOF

echo ""
echo -e "${GREEN}=== Test Plan Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Run: npm run dev"
echo "2. Login to the app (admin@folkcare.example)"
echo "3. Navigate to /caregivers"
echo "4. Click on a caregiver to test the API"
echo "5. Open browser DevTools > Network tab"
echo "6. Click and observe the GET /api/caregivers/:id response"
echo "7. Compare actual response with expected structure above"
echo ""

