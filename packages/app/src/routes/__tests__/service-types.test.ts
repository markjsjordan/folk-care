/**
 * Service Types Routes Tests
 *
 * Validates GET /api/service-types returns the standard home care service types:
 * - Skilled Nursing (SN - RN, LPN)
 * - Physical Therapy (PT)
 * - Occupational Therapy (OT)
 * - Speech Therapy (ST)
 * - Home Health Aide (HHA)
 * - Personal Care / Companionship (PC)
 * Supports optional ?state=TX|FL query parameter for state billing taxonomy codes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createServiceTypesRouter } from '../service-types.js';

describe('Service Types Routes - GET /api/service-types', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/service-types', createServiceTypesRouter());
  });

  it('returns all 6 valid home care service types without state filter', async () => {
    const res = await request(app).get('/api/service-types');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.total).toBe(6);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(6);

    const codes = res.body.data.map((item: { code: string }) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['SN', 'PT', 'OT', 'ST', 'HHA', 'PC']));

    // Skilled Nursing
    const sn = res.body.data.find((item: { code: string }) => item.code === 'SN');
    expect(sn.name).toBe('Skilled Nursing');
    expect(sn.category).toBe('SKILLED');
    expect(sn.qualifications).toEqual(expect.arrayContaining(['RN', 'LPN']));
    expect(sn.defaultTaxonomyCode).toBe('163W00000X');

    // Physical Therapy
    const pt = res.body.data.find((item: { code: string }) => item.code === 'PT');
    expect(pt.name).toBe('Physical Therapy');
    expect(pt.category).toBe('SKILLED');
    expect(pt.qualifications).toEqual(expect.arrayContaining(['PT', 'PTA']));
    expect(pt.defaultTaxonomyCode).toBe('225100000X');

    // Occupational Therapy
    const ot = res.body.data.find((item: { code: string }) => item.code === 'OT');
    expect(ot.name).toBe('Occupational Therapy');
    expect(ot.category).toBe('SKILLED');
    expect(ot.qualifications).toEqual(expect.arrayContaining(['OT', 'COTA']));
    expect(ot.defaultTaxonomyCode).toBe('225X00000X');

    // Speech Therapy
    const st = res.body.data.find((item: { code: string }) => item.code === 'ST');
    expect(st.name).toBe('Speech Therapy');
    expect(st.category).toBe('SKILLED');
    expect(st.qualifications).toEqual(expect.arrayContaining(['SLP', 'ST']));
    expect(st.defaultTaxonomyCode).toBe('235Z00000X');

    // Home Health Aide
    const hha = res.body.data.find((item: { code: string }) => item.code === 'HHA');
    expect(hha.name).toBe('Home Health Aide');
    expect(hha.category).toBe('NON_SKILLED');
    expect(hha.qualifications).toEqual(expect.arrayContaining(['HHA', 'CNA']));
    expect(hha.defaultTaxonomyCode).toBe('374U00000X');

    // Personal Care / Companionship
    const pc = res.body.data.find((item: { code: string }) => item.code === 'PC');
    expect(pc.name).toBe('Personal Care / Companionship');
    expect(pc.category).toBe('NON_SKILLED');
    expect(pc.qualifications).toEqual(expect.arrayContaining(['PCA', 'CAREGIVER']));
    expect(pc.defaultTaxonomyCode).toBe('3747P1801X');
  });

  it('supports query parameter ?state=TX with Texas billing taxonomy codes', async () => {
    const res = await request(app).get('/api/service-types?state=TX');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.state).toBe('TX');
    expect(res.body.data).toHaveLength(6);

    for (const item of res.body.data) {
      expect(item.state).toBe('TX');
      expect(item.taxonomyCode).toBeDefined();
      expect(item.stateTaxonomyCode).toBeDefined();
      expect(item.stateBillingCodes).toBeInstanceOf(Array);
      expect(item.program).toContain('Texas');
      expect(item.evvRequired).toBe(true);
    }

    const sn = res.body.data.find((item: { code: string }) => item.code === 'SN');
    expect(sn.taxonomyCode).toBe('163W00000X');
    expect(sn.stateBillingCodes).toEqual(expect.arrayContaining(['T1002', 'T1003', 'G0299', 'G0300']));

    const pc = res.body.data.find((item: { code: string }) => item.code === 'PC');
    expect(pc.taxonomyCode).toBe('3747P1801X');
    expect(pc.stateBillingCodes).toEqual(expect.arrayContaining(['T1019', 'S5125', 'S5130']));
  });

  it('supports query parameter ?state=FL with Florida billing taxonomy codes', async () => {
    const res = await request(app).get('/api/service-types?state=FL');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta.state).toBe('FL');
    expect(res.body.data).toHaveLength(6);

    for (const item of res.body.data) {
      expect(item.state).toBe('FL');
      expect(item.taxonomyCode).toBeDefined();
      expect(item.stateTaxonomyCode).toBeDefined();
      expect(item.stateBillingCodes).toBeInstanceOf(Array);
      expect(item.program).toContain('Florida');
      expect(item.evvRequired).toBe(true);
    }

    const sn = res.body.data.find((item: { code: string }) => item.code === 'SN');
    expect(sn.taxonomyCode).toBe('163W00000X');
    expect(sn.stateBillingCodes).toEqual(expect.arrayContaining(['S9123', 'S9124', 'T1002', 'T1003']));
  });

  it('handles lowercase state query parameter gracefully (case-insensitive)', async () => {
    const res = await request(app).get('/api/service-types?state=tx');

    expect(res.status).toBe(200);
    expect(res.body.meta.state).toBe('TX');
    expect(res.body.data[0].state).toBe('TX');
  });

  it('returns 400 when an invalid state query parameter is provided', async () => {
    const res = await request(app).get('/api/service-types?state=CA');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Supported states are TX and FL');
  });
});
