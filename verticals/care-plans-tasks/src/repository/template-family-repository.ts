/**
 * Template Family Repository
 * 
 * Data access layer for template families and versioned templates
 */

import { Database, UUID } from '@folkcare/core';
import {
  TemplateFamily,
  TemplateVersion,
  CreateTemplateFamilyInput,
  CreateTemplateVersionInput,
  TemplateStatus,
} from '../types/care-plan-versioning.js';

export class TemplateFamilyRepository {
  private database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  /**
   * Create a new template family
   */
  async createTemplateFamily(input: CreateTemplateFamilyInput): Promise<TemplateFamily> {
    const query = `
      INSERT INTO template_families (
        id,
        organization_id,
        code,
        name,
        category,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await this.database.query(query, [
      input.organizationId,
      input.code,
      input.name,
      input.category,
      input.isActive ?? true,
    ]);

    if (!result.rows[0]) {
      throw new Error('Failed to create template family - no row returned');
    }

    return this.mapRowToTemplateFamily(result.rows[0]);
  }

  /**
   * Get template family by ID
   */
  async getTemplateFamilyById(id: UUID): Promise<TemplateFamily | null> {
    const query = `SELECT * FROM template_families WHERE id = $1`;
    const result = await this.database.query(query, [id]);
    return result.rows[0] ? this.mapRowToTemplateFamily(result.rows[0]) : null;
  }

  /**
   * Look up template family by organization and code
   */
  async getTemplateFamilyByCode(
    organizationId: UUID,
    code: string
  ): Promise<TemplateFamily | null> {
    const query = `
      SELECT * FROM template_families
      WHERE organization_id = $1 AND code = $2
    `;
    const result = await this.database.query(query, [organizationId, code]);
    return result.rows[0] ? this.mapRowToTemplateFamily(result.rows[0]) : null;
  }

  /**
   * List template families for an organization
   */
  async listTemplateFamilies(
    organizationId: UUID,
    category?: string
  ): Promise<TemplateFamily[]> {
    let query = `
      SELECT * FROM template_families
      WHERE organization_id = $1
    `;
    const values: unknown[] = [organizationId];

    if (category) {
      query += ` AND category = $2`;
      values.push(category);
    }

    query += ` ORDER BY name ASC`;

    const result = await this.database.query(query, values);
    return result.rows.map((row) => this.mapRowToTemplateFamily(row));
  }

  /**
   * Create a template version
   */
  async createTemplateVersion(input: CreateTemplateVersionInput): Promise<TemplateVersion> {
    const query = `
      INSERT INTO template_versions (
        id,
        family_id,
        version_number,
        status,
        schema_definition,
        effective_date,
        created_by,
        created_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, NOW()
      )
      RETURNING *
    `;

    const result = await this.database.query(query, [
      input.familyId,
      input.versionNumber,
      input.status || 'DRAFT',
      JSON.stringify(input.schemaDefinition),
      input.effectiveDate || new Date(),
      input.createdBy || null,
    ]);

    if (!result.rows[0]) {
      throw new Error('Failed to create template version - no row returned');
    }

    return this.mapRowToTemplateVersion(result.rows[0]);
  }

  /**
   * Get template version by ID
   */
  async getTemplateVersionById(id: UUID): Promise<TemplateVersion | null> {
    const query = `SELECT * FROM template_versions WHERE id = $1`;
    const result = await this.database.query(query, [id]);
    return result.rows[0] ? this.mapRowToTemplateVersion(result.rows[0]) : null;
  }

  /**
   * Get latest active or released template version for a family
   */
  async getLatestTemplateVersion(familyId: UUID): Promise<TemplateVersion | null> {
    const query = `
      SELECT * FROM template_versions
      WHERE family_id = $1 AND status IN ('ACTIVE', 'DRAFT')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await this.database.query(query, [familyId]);
    return result.rows[0] ? this.mapRowToTemplateVersion(result.rows[0]) : null;
  }

  /**
   * Get all template versions for a family
   */
  async getTemplateVersions(familyId: UUID): Promise<TemplateVersion[]> {
    const query = `
      SELECT * FROM template_versions
      WHERE family_id = $1
      ORDER BY created_at DESC
    `;
    const result = await this.database.query(query, [familyId]);
    return result.rows.map((row) => this.mapRowToTemplateVersion(row));
  }

  /**
   * Helper: Map row to TemplateFamily entity
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRowToTemplateFamily(row: any): TemplateFamily {
    return {
      id: row.id,
      organizationId: row.organization_id,
      code: row.code,
      name: row.name,
      category: row.category,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Helper: Map row to TemplateVersion entity
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRowToTemplateVersion(row: any): TemplateVersion {
    const schema =
      typeof row.schema_definition === 'string'
        ? JSON.parse(row.schema_definition)
        : row.schema_definition;
    return {
      id: row.id,
      familyId: row.family_id,
      versionNumber: row.version_number,
      status: row.status as TemplateStatus,
      schemaDefinition: schema,
      effectiveDate: new Date(row.effective_date),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
    };
  }
}
