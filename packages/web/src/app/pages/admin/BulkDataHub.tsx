/**
 * Bulk Data Hub
 *
 * Provides agency administrators with:
 * 1. Bulk CSV Import Wizard (Clients & Caregivers) with:
 *    - Two-phase workflow (Phase 1: Validation, Duplicate Detection, Preview; Phase 2: Transactional Commit)
 *    - Support for legacy systems (HHAeXchange, ClearCare, Alora)
 *    - Drag-and-drop file upload, column mapping selector, preview table with error highlights
 * 2. Regulatory Audit Pack Export with:
 *    - One-click ZIP generation containing client records, EVV logs, caregiver credentials, visit notes
 *    - HIPAA Security Rule (45 CFR § 164.312(b)) audit logging
 */

import React, { useState, useRef, useId } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Layers,
  ShieldCheck,
  Calendar,
  Users,
  UserCheck,
  FileArchive,
  Lock,
  Check,
} from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Badge } from '@/core/components';

type EntityType = 'clients' | 'caregivers';
type ImportStep = 'upload' | 'mapping' | 'preview' | 'completed';
type DuplicateStrategy = 'skip' | 'update';

interface ColumnMapping {
  csvHeader: string;
  targetField: string;
}

interface DuplicateMatch {
  matchedBy: 'id' | 'email' | 'name_dob';
  existingRecordId: string;
  details: string;
}

interface ImportPreviewRow {
  rowNumber: number;
  data: Record<string, unknown>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  duplicateMatch?: DuplicateMatch;
}

interface ImportPreviewResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  duplicateRows: number;
  detectedPreset?: string;
  rows: ImportPreviewRow[];
  headers: string[];
  suggestedMappings: ColumnMapping[];
}

const CLIENT_TARGET_FIELDS = [
  { key: 'client_number', label: 'Client / Patient ID *', required: true },
  { key: 'first_name', label: 'First Name *', required: true },
  { key: 'last_name', label: 'Last Name *', required: true },
  { key: 'date_of_birth', label: 'Date of Birth (YYYY-MM-DD) *', required: true },
  { key: 'gender', label: 'Gender', required: false },
  { key: 'phone', label: 'Phone Number', required: false },
  { key: 'email', label: 'Email Address', required: false },
  { key: 'street1', label: 'Street Address 1', required: false },
  { key: 'street2', label: 'Street Address 2', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'state', label: 'State (2-letter code)', required: false },
  { key: 'zipCode', label: 'ZIP Code', required: false },
  { key: 'emergency_contact_name', label: 'Emergency Contact Name', required: false },
  { key: 'emergency_contact_phone', label: 'Emergency Contact Phone', required: false },
  { key: 'status', label: 'Status (ACTIVE/INACTIVE)', required: false },
  { key: 'notes', label: 'Clinical / Service Notes', required: false },
];

const CAREGIVER_TARGET_FIELDS = [
  { key: 'employee_number', label: 'Employee / Staff ID *', required: true },
  { key: 'first_name', label: 'First Name *', required: true },
  { key: 'last_name', label: 'Last Name *', required: true },
  { key: 'date_of_birth', label: 'Date of Birth (YYYY-MM-DD) *', required: true },
  { key: 'email', label: 'Email Address *', required: true },
  { key: 'phone', label: 'Phone Number *', required: true },
  { key: 'hire_date', label: 'Hire Date (YYYY-MM-DD)', required: false },
  { key: 'employment_type', label: 'Employment Type (FULL_TIME, PART_TIME)', required: false },
  { key: 'role', label: 'Staff Role / Title', required: false },
  { key: 'street1', label: 'Street Address', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'zipCode', label: 'ZIP Code', required: false },
  { key: 'credentials', label: 'Credentials / Certifications (semicolon separated)', required: false },
  { key: 'pay_rate_amount', label: 'Hourly Pay Rate ($)', required: false },
  { key: 'status', label: 'Status (ACTIVE/INACTIVE)', required: false },
];

export const BulkDataHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');

  // Import State
  const [entityType, setEntityType] = useState<EntityType>('clients');
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [detectedPreset, setDetectedPreset] = useState<string>('Custom');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'issues' | 'duplicates'>('all');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [commitSummary, setCommitSummary] = useState<{ imported: number; updated: number; skipped: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const auditPackStartDateId = useId();
  const auditPackEndDateId = useId();

  // Export State
  const [exportStartDate, setExportStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? ''
  );
  const [exportEndDate, setExportEndDate] = useState<string>(
    new Date().toISOString().split('T')[0] ?? ''
  );
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        handleFileSelected(file);
      } else {
        setErrorMessage('Please upload a valid .csv file.');
      }
    }
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setErrorMessage(null);
    setCommitSummary(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setFileContent(text);
      parseHeadersAndPreset(text);
    };
    reader.readAsText(file);
  };

  const parseHeadersAndPreset = (csvText: string) => {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      setErrorMessage('The uploaded CSV file is empty.');
      return;
    }

    const headerLine = lines[0] ?? '';
    const rawHeaders = headerLine.split(',').map((h) => h.replace(/(^["'])|(["']$)/g, '').trim());
    setCsvHeaders(rawHeaders);

    // Auto-detect mappings and presets
    const targetFields = entityType === 'clients' ? CLIENT_TARGET_FIELDS : CAREGIVER_TARGET_FIELDS;
    const initialMappings: Record<string, string> = {};
    const headerLower = rawHeaders.map((h) => h.toLowerCase());

    // Legacy format heuristics
    let detected = 'Standard';
    if (headerLower.some((h) => h.includes('hha') || h.includes('member_id') || h.includes('caregiver_code'))) {
      detected = 'HHAeXchange';
    } else if (headerLower.some((h) => h.includes('clearcare') || h.includes('client_id') || h.includes('staff_id'))) {
      detected = 'ClearCare';
    } else if (headerLower.some((h) => h.includes('alora') || h.includes('patient_code'))) {
      detected = 'Alora';
    }
    setDetectedPreset(detected);

    for (const header of rawHeaders) {
      const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = targetFields.find((tf) => {
        const tfNorm = tf.key.toLowerCase().replace(/[^a-z0-9]/g, '');
        return tfNorm === norm || norm.includes(tfNorm) || tfNorm.includes(norm);
      });
      if (match) {
        initialMappings[header] = match.key;
      }
    }

    setMappings(initialMappings);
    setStep('mapping');
  };

  // Phase 1: Validate file, parse columns, detect duplicates, return preview
  const handleRunValidationPreview = async () => {
    if (!fileContent) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const formattedMappings = Object.entries(mappings).map(([csvHeader, targetField]) => ({
        csvHeader,
        targetField,
      }));

      const endpoint = entityType === 'clients' ? '/api/import/clients/csv' : '/api/import/caregivers/csv';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvContent: fileContent,
          columnMappings: formattedMappings,
          previewOnly: true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();
      setPreviewResult(data);
      setStep('preview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Validation failed. Please verify your CSV headers.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Phase 2: Confirm & commit records into database inside single transaction
  const handleConfirmAndCommit = async () => {
    if (!previewResult) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const validRecordsToCommit = previewResult.rows
        .filter((r) => r.isValid)
        .map((r) => r.data);

      const endpoint = entityType === 'clients' ? '/api/import/clients/csv' : '/api/import/caregivers/csv';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          records: validRecordsToCommit,
          duplicateStrategy,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Commit failed with status ${response.status}`);
      }

      const resData = await response.json();
      setCommitSummary({
        imported: resData.imported ?? resData.summary?.imported ?? validRecordsToCommit.length,
        updated: resData.updated ?? resData.summary?.updated ?? 0,
        skipped: resData.skipped ?? resData.summary?.skipped ?? 0,
      });
      setStep('completed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to commit import records into database.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download template
  const handleDownloadTemplate = (type: EntityType) => {
    let csvContent = '';
    let filename = '';
    if (type === 'clients') {
      filename = 'folkcare-clients-template.csv';
      csvContent =
        'client_number,first_name,last_name,date_of_birth,phone,email,street1,city,state,zipCode,emergency_contact_name,emergency_contact_phone,status,notes\n' +
        'C001,John,Smith,1950-01-15,512-555-0101,john.smith@example.com,100 Oak Ave,Austin,TX,78701,Mary Smith,512-555-0102,ACTIVE,Mild mobility assistance needed\n' +
        'C002,Mary,Johnson,1955-06-20,512-555-0201,mary.j@example.com,200 Elm St,Austin,TX,78702,Bob Johnson,512-555-0202,ACTIVE,Wound dressing support\n';
    } else {
      filename = 'folkcare-caregivers-template.csv';
      csvContent =
        'employee_number,first_name,last_name,date_of_birth,email,phone,hire_date,employment_type,role,credentials,pay_rate_amount,status\n' +
        'E001,Maria,Garcia,1980-05-12,maria.garcia@example.com,512-555-0301,2023-01-15,FULL_TIME,HOME_HEALTH_AIDE,CPR;CNA,18.50,ACTIVE\n' +
        'E002,James,Brown,1975-08-22,james.brown@example.com,512-555-0302,2023-03-01,PART_TIME,COMPANION,CPR,16.00,ACTIVE\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Regulatory Audit Pack Export handler
  const handleGenerateAuditPack = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setExportSuccessMessage(null);

    try {
      const response = await fetch('/api/export/audit-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: exportStartDate,
          endDate: exportEndDate,
          format: exportFormat,
          includeEvv: true,
          includeCredentials: true,
          includeNotes: true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Export failed with status ${response.status}`);
      }

      // Download the blob directly
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-pack-${exportStartDate}-to-${exportEndDate}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setExportSuccessMessage(
        `Audit pack successfully generated and downloaded. HIPAA Security Rule compliance audit log entry recorded.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate regulatory audit pack.';
      setErrorMessage(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const targetFields = entityType === 'clients' ? CLIENT_TARGET_FIELDS : CAREGIVER_TARGET_FIELDS;

  // Filter preview rows
  const filteredRows = (previewResult?.rows || []).filter((row) => {
    if (previewFilter === 'valid') return row.isValid && !row.duplicateMatch;
    if (previewFilter === 'issues') return !row.isValid || row.errors.length > 0 || row.warnings.length > 0;
    if (previewFilter === 'duplicates') return !!row.duplicateMatch;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Data Hub & Regulatory Export</h1>
          <p className="mt-1 text-sm text-gray-600">
            Import agency records from legacy platforms or generate state survey audit packs.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('import');
              setErrorMessage(null);
            }}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'import'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Upload className="h-4 w-4 text-blue-600" />
            Bulk CSV Import Wizard
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('export');
              setErrorMessage(null);
            }}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'export'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileArchive className="h-4 w-4 text-purple-600" />
            Regulatory Audit Pack Export
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <span className="font-semibold">Error:</span> {errorMessage}
          </div>
        </div>
      )}

      {exportSuccessMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">{exportSuccessMessage}</div>
        </div>
      )}

      {/* TAB 1: BULK IMPORT WIZARD */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Step Breadcrumb */}
          <div className="grid grid-cols-4 gap-2 text-sm">
            {[
              { id: 'upload', label: '1. Upload CSV' },
              { id: 'mapping', label: '2. Column Mapping' },
              { id: 'preview', label: '3. Preview & Validate' },
              { id: 'completed', label: '4. Commit Records' },
            ].map((s) => {
              const isCurrent = step === s.id;
              const isPassed =
                (s.id === 'upload' && step !== 'upload') ||
                (s.id === 'mapping' && (step === 'preview' || step === 'completed')) ||
                (s.id === 'preview' && step === 'completed');

              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-center py-2.5 px-3 rounded-lg border font-medium text-center ${
                    isCurrent
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : isPassed
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  {isPassed ? <Check className="h-4 w-4 mr-1 text-green-600" /> : null}
                  {s.label}
                </div>
              );
            })}
          </div>

          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <Card>
              <CardHeader
                title="Select Entity & Upload CSV"
                subtitle="Import clients or caregivers from HHAeXchange, ClearCare, Alora, or standard CSV."
              />
              <CardContent className="space-y-6">
                {/* Entity Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Target Entity</label>
                  <div className="grid grid-cols-2 gap-4 max-w-md">
                    <button
                      type="button"
                      onClick={() => setEntityType('clients')}
                      className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-all ${
                        entityType === 'clients'
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <Users className={`h-6 w-6 ${entityType === 'clients' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div>
                        <div className="font-semibold text-gray-900">Clients</div>
                        <div className="text-xs text-gray-500">Demographics, contacts, addresses</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEntityType('caregivers')}
                      className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-all ${
                        entityType === 'caregivers'
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/20'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <UserCheck
                        className={`h-6 w-6 ${entityType === 'caregivers' ? 'text-blue-600' : 'text-gray-400'}`}
                      />
                      <div>
                        <div className="font-semibold text-gray-900">Caregivers</div>
                        <div className="text-xs text-gray-500">Staff records, credentials, roles</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Dropzone */}
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-colors bg-gray-50/50"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                      }
                    }}
                  />
                  <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-gray-900">Drag and drop your CSV file here</h3>
                  <p className="text-sm text-gray-500 mt-1 mb-4">
                    Supports exports from HHAeXchange, ClearCare, Alora, or custom agency exports.
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Browse CSV File
                  </Button>
                </div>

                {/* Templates & Guidance */}
                <div className="border-t pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600">
                  <span>Need an example template formatted for FolkCare?</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadTemplate(entityType)}
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      Download {entityType === 'clients' ? 'Client' : 'Caregiver'} Template (.csv)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: MAPPING */}
          {step === 'mapping' && (
            <Card>
              <CardHeader
                title="Column Mapping & Legacy Preset"
                subtitle={`Map CSV columns from "${selectedFile?.name}" to FolkCare ${entityType} fields.`}
              />
              <CardContent className="space-y-6">
                {/* Preset Banner */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-3">
                    <Layers className="h-5 w-5 text-blue-600" />
                    <div>
                      <span className="font-semibold text-blue-900">Detected System: </span>
                      <span className="text-blue-800 font-medium">{detectedPreset} Format</span>
                    </div>
                  </div>
                  <Badge variant="info">Auto-Mapped {Object.keys(mappings).length} Columns</Badge>
                </div>

                {/* Mapping Table */}
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">CSV Header</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Sample Header Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Target FolkCare Field</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {csvHeaders.map((header) => {
                        const currentTarget = mappings[header] || '';

                        return (
                          <tr key={header} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-900 font-semibold">{header}</td>
                            <td className="px-4 py-3 text-gray-500">{header}</td>
                            <td className="px-4 py-3">
                              <select
                                value={currentTarget}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setMappings((prev) => {
                                    const next = { ...prev };
                                    if (val === '') {
                                      delete next[header];
                                    } else {
                                      next[header] = val;
                                    }
                                    return next;
                                  });
                                }}
                                className="w-full rounded-md border-gray-300 py-1.5 px-2 text-sm border focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">-- Ignore this column --</option>
                                {targetFields.map((tf) => (
                                  <option key={tf.key} value={tf.key}>
                                    {tf.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              {currentTarget ? (
                                <Badge variant="success">Mapped</Badge>
                              ) : (
                                <Badge variant="default">Ignored</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <Button variant="outline" onClick={() => setStep('upload')}>
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    disabled={isProcessing || Object.keys(mappings).length === 0}
                    onClick={handleRunValidationPreview}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Validating Data...
                      </>
                    ) : (
                      <>
                        Preview & Detect Duplicates
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: PREVIEW */}
          {step === 'preview' && previewResult && (
            <Card>
              <CardHeader
                title="Phase 1: Validation & Deduplication Preview"
                subtitle="Review validated records, duplicates, and errors before committing to the database."
              />
              <CardContent className="space-y-6">
                {/* Stats Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 rounded-lg border bg-gray-50 text-center">
                    <div className="text-xs text-gray-500 font-medium">Total Rows</div>
                    <div className="text-xl font-bold text-gray-900 mt-0.5">{previewResult.totalRows}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-green-200 bg-green-50 text-center">
                    <div className="text-xs text-green-700 font-medium">Valid Ready</div>
                    <div className="text-xl font-bold text-green-700 mt-0.5">{previewResult.validRows}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-center">
                    <div className="text-xs text-amber-700 font-medium">Warnings</div>
                    <div className="text-xl font-bold text-amber-700 mt-0.5">{previewResult.warningRows}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-center">
                    <div className="text-xs text-red-700 font-medium">Errors (Blocked)</div>
                    <div className="text-xl font-bold text-red-700 mt-0.5">{previewResult.errorRows}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-purple-200 bg-purple-50 text-center">
                    <div className="text-xs text-purple-700 font-medium">Duplicates</div>
                    <div className="text-xl font-bold text-purple-700 mt-0.5">{previewResult.duplicateRows}</div>
                  </div>
                </div>

                {/* Duplicate Policy Choice */}
                <div className="p-4 rounded-lg bg-gray-50 border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">Duplicate Record Policy</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Choose how FolkCare handles existing matching clients / caregivers during commit.
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="dupStrategy"
                        value="skip"
                        checked={duplicateStrategy === 'skip'}
                        onChange={() => setDuplicateStrategy('skip')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Skip Duplicates (Recommended)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="dupStrategy"
                        value="update"
                        checked={duplicateStrategy === 'update'}
                        onChange={() => setDuplicateStrategy('update')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Update Existing Records</span>
                    </label>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex gap-2">
                    {(['all', 'valid', 'issues', 'duplicates'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setPreviewFilter(filter)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                          previewFilter === filter
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {filter} {filter === 'all' ? `(${previewResult.totalRows})` : ''}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">Showing {filteredRows.length} rows</span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border rounded-lg max-h-96">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Row</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Identifier</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Full Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">DOB</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Contact</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Issues / Duplicates</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {filteredRows.map((row) => {
                        const hasErrors = row.errors.length > 0;
                        const hasDup = !!row.duplicateMatch;

                        const idVal = String(
                          row.data['client_number'] || row.data['employee_number'] || row.data['id'] || '-'
                        );
                        const nameVal = `${row.data['first_name'] || ''} ${row.data['last_name'] || ''}`.trim() || '-';
                        const dobVal = String(row.data['date_of_birth'] || '-');
                        const contactVal = String(row.data['email'] || row.data['phone'] || '-');

                        return (
                          <tr
                            key={row.rowNumber}
                            className={`${
                              hasErrors ? 'bg-red-50/40' : hasDup ? 'bg-purple-50/40' : 'hover:bg-gray-50/50'
                            }`}
                          >
                            <td className="px-3 py-2 font-mono text-gray-500">{row.rowNumber}</td>
                            <td className="px-3 py-2">
                              {hasErrors ? (
                                <Badge variant="error">Invalid</Badge>
                              ) : hasDup ? (
                                <Badge variant="warning">Duplicate</Badge>
                              ) : (
                                <Badge variant="success">Valid</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono font-medium text-gray-900">{idVal}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">{nameVal}</td>
                            <td className="px-3 py-2 text-gray-600">{dobVal}</td>
                            <td className="px-3 py-2 text-gray-600">{contactVal}</td>
                            <td className="px-3 py-2">
                              {hasErrors && (
                                <div className="text-red-700 flex items-center gap-1">
                                  <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>{row.errors.join('; ')}</span>
                                </div>
                              )}
                              {hasDup && (
                                <div className="text-purple-700 flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>{row.duplicateMatch?.details}</span>
                                </div>
                              )}
                              {!hasErrors && !hasDup && <span className="text-gray-400">None</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <Button variant="outline" onClick={() => setStep('mapping')}>
                    Back to Mappings
                  </Button>
                  <Button
                    variant="primary"
                    disabled={isProcessing || previewResult.validRows === 0}
                    onClick={handleConfirmAndCommit}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Committing Transaction...
                      </>
                    ) : (
                      <>
                        Confirm & Commit ({previewResult.validRows} Records)
                        <CheckCircle2 className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 4: COMPLETED */}
          {step === 'completed' && commitSummary && (
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Import Successfully Committed!</h2>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  All records were imported in a single atomic database transaction with full audit logging.
                </p>

                <div className="flex justify-center gap-6 py-4">
                  <div className="text-center">
                    <div className="text-3xl font-extrabold text-green-600">{commitSummary.imported}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Imported Records</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-extrabold text-blue-600">{commitSummary.updated}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Updated Records</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-extrabold text-gray-600">{commitSummary.skipped}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Skipped Duplicates</div>
                  </div>
                </div>

                <div className="pt-4 flex justify-center gap-3">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setStep('upload');
                      setSelectedFile(null);
                      setFileContent('');
                      setPreviewResult(null);
                      setCommitSummary(null);
                    }}
                  >
                    Import Another File
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: REGULATORY AUDIT PACK EXPORT */}
      {activeTab === 'export' && (
        <Card>
          <CardHeader
            title="State Regulatory Audit Pack Export"
            subtitle="Generate a comprehensive, immutable ZIP audit package for state licensing surveys (HHSC/AHCA), CMS Medicare/Medicaid audits, or accreditation reviews."
          />
          <CardContent className="space-y-6">
            {/* Security Notice */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 flex items-start gap-3">
              <ShieldCheck className="h-6 w-6 text-blue-700 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-blue-900">
                  HIPAA Security Rule Audit Compliance (45 CFR § 164.312(b))
                </div>
                <div className="text-xs text-blue-800 leading-relaxed">
                  Every regulatory audit pack generation is permanently logged with the requester's user ID, IP
                  address, export timestamp, client count, and cryptographic manifest. The resulting archive contains
                  self-contained verification manifests to support state survey audit trails.
                </div>
              </div>
            </div>

            {/* Scope / Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor={auditPackStartDateId} className="block text-sm font-medium text-gray-700 mb-1">
                  Audit Survey Start Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    id={auditPackStartDateId}
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={auditPackEndDateId} className="block text-sm font-medium text-gray-700 mb-1">
                  Audit Survey End Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    id={auditPackEndDateId}
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Package Contents Checklist */}
            <div className="rounded-lg border p-4 bg-gray-50/50 space-y-3">
              <div className="text-sm font-semibold text-gray-900">Audit Pack Manifest Contents:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    <strong>Client Records</strong> (`clients.csv` / `clients.json`)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    <strong>EVV Electronic Visit Logs</strong> (`evv_logs.csv` - 6 Cures Act elements)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    <strong>Caregiver Licensure & Screenings</strong> (`caregiver_credentials.csv`)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    <strong>Visit Notes & Supervisory Evaluations</strong> (`visit_notes.csv`)
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Lock className="h-4 w-4 text-purple-600 flex-shrink-0" />
                  <span>
                    <strong>Cryptographic Audit Manifest</strong> (`manifest.json` - SHA-256 verification hashes)
                  </span>
                </div>
              </div>
            </div>

            {/* Format Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Package Data Format</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="csv"
                    checked={exportFormat === 'csv'}
                    onChange={() => setExportFormat('csv')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>CSV Archive (Standard for state auditors & Excel inspection)</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="json"
                    checked={exportFormat === 'json'}
                    onChange={() => setExportFormat('json')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>JSON Archive (Machine-readable healthcare interoperability)</span>
                </label>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-4 border-t flex justify-end">
              <Button
                variant="primary"
                disabled={isExporting}
                onClick={handleGenerateAuditPack}
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating Audit Pack Archive...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Generate & Download Audit Pack (.zip)
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
