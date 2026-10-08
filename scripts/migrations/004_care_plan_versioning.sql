-- Migration 004: Care Plan Versioning, Templates & Digital Signatures (FC-020)
-- Implements immutable version snapshots for Medicaid audit trails (Texas HHSC 26 TAC §558 & Florida AHCA Chapter 59A-8)

-- 1. Signatures Table
CREATE TABLE IF NOT EXISTS signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signer_id UUID NOT NULL,
    signer_role VARCHAR(50) NOT NULL,
    signature_svg TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    audit_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signatures_signer_id ON signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signed_at ON signatures(signed_at);

-- 2. Template Families Table
CREATE TABLE IF NOT EXISTS template_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_template_families_org_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_template_families_org_id ON template_families(organization_id);
CREATE INDEX IF NOT EXISTS idx_template_families_category ON template_families(category);

-- 3. Template Versions Table
CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES template_families(id) ON DELETE CASCADE,
    version_number VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED')),
    schema_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_template_versions_family_version UNIQUE (family_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_template_versions_family_id ON template_versions(family_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_status ON template_versions(status);

-- 4. Care Plan Versions Table (Immutable Snapshots)
CREATE TABLE IF NOT EXISTS care_plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_plan_id UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    effective_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_end TIMESTAMPTZ,
    superseded_by_version_id UUID REFERENCES care_plan_versions(id) ON DELETE SET NULL,
    change_reason TEXT,
    signature_id UUID REFERENCES signatures(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    CONSTRAINT uq_care_plan_versions_plan_version UNIQUE (care_plan_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_care_plan_versions_care_plan_id ON care_plan_versions(care_plan_id);
CREATE INDEX IF NOT EXISTS idx_care_plan_versions_plan_status ON care_plan_versions(care_plan_id, status);
CREATE INDEX IF NOT EXISTS idx_care_plan_versions_signature_id ON care_plan_versions(signature_id);

-- 5. Extend care_plans table with versioning tracking columns
ALTER TABLE care_plans ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE care_plans ADD COLUMN IF NOT EXISTS template_family_id UUID REFERENCES template_families(id) ON DELETE SET NULL;
ALTER TABLE care_plans ADD COLUMN IF NOT EXISTS template_version_id UUID REFERENCES template_versions(id) ON DELETE SET NULL;
