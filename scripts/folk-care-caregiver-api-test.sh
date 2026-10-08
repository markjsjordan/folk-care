#!/usr/bin/env bash
# ==============================================================================
# FolkCare Caregiver API Integration Test
#
# Tests the caregiver endpoints against a running local server.
# If no server is running, automatically starts an isolated test server on port 3099.
# ==============================================================================

set -uo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED_COUNT=0
FAILED_COUNT=0

# Determine target URL
PORT="${PORT:-3000}"
DEFAULT_URL="http://localhost:${PORT}"
TEST_PORT=3099
SPAWNED_PID=""

cleanup() {
  if [ -n "$SPAWNED_PID" ]; then
    kill "$SPAWNED_PID" 2>/dev/null || true
    wait "$SPAWNED_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Check if target server is already reachable
SERVER_URL="${API_URL:-}"
if [ -z "$SERVER_URL" ]; then
  if curl -s -f "http://localhost:${PORT}/health" >/dev/null 2>&1 || curl -s -f "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    SERVER_URL="http://localhost:${PORT}"
  elif curl -s -f "http://localhost:3001/health" >/dev/null 2>&1 || curl -s -f "http://localhost:3001/api/health" >/dev/null 2>&1; then
    SERVER_URL="http://localhost:3001"
  else
    echo -e "${YELLOW}No running API server detected on default ports.${NC}"
    echo -e "${BLUE}Starting isolated caregiver test server on port ${TEST_PORT}...${NC}"
    TEST_SERVER_PORT="${TEST_PORT}" npx tsx scripts/start-caregiver-test-server.ts >/dev/null 2>&1 &
    SPAWNED_PID=$!
    
    # Wait up to 10 seconds for test server to be ready
    for i in {1..20}; do
      if curl -s -f "http://localhost:${TEST_PORT}/health" >/dev/null 2>&1; then
        SERVER_URL="http://localhost:${TEST_PORT}"
        break
      fi
      sleep 0.5
    done

    if [ -z "$SERVER_URL" ]; then
      echo -e "${RED}Failed to start isolated caregiver test server.${NC}"
      exit 1
    fi
    echo -e "${GREEN}✓ Test server ready at ${SERVER_URL}${NC}\n"
  fi
fi

echo -e "${YELLOW}====================================================${NC}"
echo -e "${YELLOW}   FolkCare Caregiver API Integration Test Suite    ${NC}"
echo -e "${YELLOW}   Target: ${SERVER_URL}                            ${NC}"
echo -e "${YELLOW}====================================================${NC}\n"

# Helper function for assertions
assert_status() {
  local test_name="$1"
  local actual_status="$2"
  local expected_status="$3"
  local response_body="$4"

  if [ "$actual_status" -eq "$expected_status" ]; then
    echo -e "${GREEN}✓ [PASS]${NC} ${test_name} (HTTP ${actual_status})"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo -e "${RED}✗ [FAIL]${NC} ${test_name} - Expected HTTP ${expected_status}, got ${actual_status}"
    if [ -n "$response_body" ]; then
      echo -e "${RED}  Response:${NC} ${response_body:0:200}"
    fi
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
}

AUTH_TOKEN="Bearer mock-test-token-valid"

# Test 1: Health check
echo -e "${BLUE}Test 1: Server Health Check${NC}"
HTTP_CODE=$(curl -s -o /tmp/fc_health.json -w "%{http_code}" "${SERVER_URL}/health" || curl -s -o /tmp/fc_health.json -w "%{http_code}" "${SERVER_URL}/api/health")
assert_status "Server health check" "$HTTP_CODE" 200 "$(cat /tmp/fc_health.json 2>/dev/null || echo '')"

# Test 2: Unauthorized request returns 401
echo -e "\n${BLUE}Test 2: Authorization Enforcement${NC}"
HTTP_CODE=$(curl -s -o /tmp/fc_auth.json -w "%{http_code}" "${SERVER_URL}/api/caregivers")
assert_status "GET /api/caregivers without token returns 401" "$HTTP_CODE" 401 "$(cat /tmp/fc_auth.json 2>/dev/null || echo '')"

# Test 3: Authorized request returns 200
echo -e "\n${BLUE}Test 3: List Caregivers${NC}"
HTTP_CODE=$(curl -s -o /tmp/fc_caregivers.json -w "%{http_code}" \
  -H "Authorization: ${AUTH_TOKEN}" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000" \
  "${SERVER_URL}/api/caregivers")
assert_status "GET /api/caregivers with Bearer token returns 200" "$HTTP_CODE" 200 "$(cat /tmp/fc_caregivers.json 2>/dev/null || echo '')"

# Test 4: Filter caregivers by status=ACTIVE
echo -e "\n${BLUE}Test 4: Filter Caregivers by Status${NC}"
HTTP_CODE=$(curl -s -o /tmp/fc_active.json -w "%{http_code}" \
  -H "Authorization: ${AUTH_TOKEN}" \
  "${SERVER_URL}/api/caregivers?status=ACTIVE")
assert_status "GET /api/caregivers?status=ACTIVE returns 200" "$HTTP_CODE" 200 "$(cat /tmp/fc_active.json 2>/dev/null || echo '')"

# Test 5: Get specific caregiver profile by ID and validate structure
echo -e "\n${BLUE}Test 5: Fetch Caregiver Profile Structure${NC}"
CAREGIVER_ID="cg-tx-rn-001"
# If testing against live app with different demo IDs, try first ID from list if available
if [ -f /tmp/fc_caregivers.json ]; then
  EXTRACTED_ID=$(grep -o '"id":"[^"]*"' /tmp/fc_caregivers.json | head -n 1 | cut -d'"' -f4 || echo "")
  if [ -n "$EXTRACTED_ID" ]; then
    CAREGIVER_ID="$EXTRACTED_ID"
  fi
fi

HTTP_CODE=$(curl -s -o /tmp/fc_detail.json -w "%{http_code}" \
  -H "Authorization: ${AUTH_TOKEN}" \
  "${SERVER_URL}/api/caregivers/${CAREGIVER_ID}")
assert_status "GET /api/caregivers/${CAREGIVER_ID} returns 200" "$HTTP_CODE" 200 "$(cat /tmp/fc_detail.json 2>/dev/null || echo '')"

# Verify expected JSON fields
DETAIL_BODY=$(cat /tmp/fc_detail.json 2>/dev/null || echo '')
if [[ "$DETAIL_BODY" == *"firstName"* && "$DETAIL_BODY" == *"lastName"* && "$DETAIL_BODY" == *"status"* ]]; then
  echo -e "${GREEN}✓ [PASS]${NC} Response contains essential fields (firstName, lastName, status)"
  PASSED_COUNT=$((PASSED_COUNT + 1))
else
  echo -e "${RED}✗ [FAIL]${NC} Response missing expected fields"
  FAILED_COUNT=$((FAILED_COUNT + 1))
fi

# Test 6: Non-existent caregiver returns 404
echo -e "\n${BLUE}Test 6: Non-existent Caregiver ID${NC}"
HTTP_CODE=$(curl -s -o /tmp/fc_notfound.json -w "%{http_code}" \
  -H "Authorization: ${AUTH_TOKEN}" \
  "${SERVER_URL}/api/caregivers/non-existent-id-000")
assert_status "GET /api/caregivers/non-existent-id-000 returns 404" "$HTTP_CODE" 404 "$(cat /tmp/fc_notfound.json 2>/dev/null || echo '')"

# Print test summary
echo -e "\n${YELLOW}====================================================${NC}"
echo -e "${YELLOW}                  Test Results                      ${NC}"
echo -e "${YELLOW}====================================================${NC}"
echo -e "Passed: ${GREEN}${PASSED_COUNT}${NC}"
echo -e "Failed: ${RED}${FAILED_COUNT}${NC}"

# Clean temporary files
rm -f /tmp/fc_health.json /tmp/fc_auth.json /tmp/fc_caregivers.json /tmp/fc_active.json /tmp/fc_detail.json /tmp/fc_notfound.json

if [ "$FAILED_COUNT" -gt 0 ]; then
  echo -e "\n${RED}Caregiver API tests failed!${NC}"
  exit 1
else
  echo -e "\n${GREEN}All Caregiver API tests passed successfully!${NC}"
  exit 0
fi
