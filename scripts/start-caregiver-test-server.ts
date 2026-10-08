#!/usr/bin/env tsx
/**
 * Caregiver Test API Server
 * 
 * Provides an isolated endpoint server for caregiver API test scripts
 * when the main dev server is not running. Serves sanitized caregiver profiles.
 */

import express from 'express';
import { SANITIZED_CAREGIVER_SEEDS } from './seed/caregivers.js';

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'caregiver-api-test-server', timestamp: '2025-01-15T00:00:00.000Z' });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'caregiver-api-test-server', timestamp: '2025-01-15T00:00:00.000Z' });
});

// List caregivers
app.get('/api/caregivers', (req, res) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized: Bearer token required' });
    return;
  }

  const { status, role } = req.query;
  let results = [...SANITIZED_CAREGIVER_SEEDS];

  if (typeof status === 'string') {
    results = results.filter((c) => c.status === status);
  }

  if (typeof role === 'string') {
    results = results.filter((c) => c.role === role);
  }

  res.status(200).json({
    success: true,
    data: results,
    meta: {
      count: results.length,
      total: SANITIZED_CAREGIVER_SEEDS.length,
    },
  });
});

// Get caregiver by ID
app.get('/api/caregivers/:id', (req, res) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized: Bearer token required' });
    return;
  }

  const caregiver = SANITIZED_CAREGIVER_SEEDS.find((c) => c.id === req.params.id);
  if (!caregiver) {
    res.status(404).json({ success: false, error: 'Caregiver not found' });
    return;
  }

  res.status(200).json(caregiver);
});

const PORT = parseInt(process.env['TEST_SERVER_PORT'] || process.env['PORT'] || '3099', 10);
const server = app.listen(PORT, () => {
  console.log(`Caregiver test server listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
