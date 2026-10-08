-- Migration: Add Performance Composite Indexes (FC-16)
-- Description: Composite indexes for visits, clients, caregiver_profiles, evv_logs
-- Date: 2026-10-08

-- ============================================================================
-- HIGH-TRAFFIC MULTI-TENANT COMPOSITE INDEXES
-- ============================================================================

-- 1. Visits table (organization_id, scheduled_date, status)
CREATE INDEX IF NOT EXISTS idx_visits_org_date_status
  ON visits(organization_id, scheduled_date, status)
  WHERE deleted_at IS NULL;

-- 2. Clients table (organization_id, status)
CREATE INDEX IF NOT EXISTS idx_clients_org_status
  ON clients(organization_id, status)
  WHERE deleted_at IS NULL;

-- 3. Caregivers / Caregiver Profiles (organization_id, employment_status)
CREATE INDEX IF NOT EXISTS idx_caregivers_org_employment_status
  ON caregivers(organization_id, employment_status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS caregiver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  caregiver_id UUID,
  employment_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caregiver_profiles_org_emp_status
  ON caregiver_profiles(organization_id, employment_status);

-- 4. EVV Records / EVV Logs (visit_id, created_at)
CREATE INDEX IF NOT EXISTS idx_evv_records_visit_created
  ON evv_records(visit_id, created_at);

CREATE TABLE IF NOT EXISTS evv_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  level VARCHAR(20) DEFAULT 'INFO',
  message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_evv_logs_visit_created
  ON evv_logs(visit_id, created_at);
