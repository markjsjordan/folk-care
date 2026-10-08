import React, { useState } from "react";
import {
  X,
  Copy,
  Download,
  FileText,
  Check,
  ShieldCheck,
  ShieldAlert,
  FileSpreadsheet,
} from "lucide-react";
import toast from "react-hot-toast";
import type { ClaimsQueueItem, CMS1500ClaimForm } from "../types";
import { formatCurrency } from "../utils";

interface ClaimsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClaim?: ClaimsQueueItem | null;
  allClaims?: ClaimsQueueItem[];
  ediContent?: string;
  cms1500Forms?: CMS1500ClaimForm[];
  csvContent?: string;
  /** Server rejections (e.g. EVV gate 422) per export format. */
  exportErrors?: { edi?: string; cms1500?: string; csv?: string };
}

const ExportBlocked: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2.5"
  >
    <ShieldAlert className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
    <div>
      <p className="text-xs font-bold text-red-900 uppercase tracking-wide">
        Export blocked
      </p>
      <p className="text-xs text-red-800 mt-1 break-words">{message}</p>
    </div>
  </div>
);

export const ClaimsExportModal: React.FC<ClaimsExportModalProps> = ({
  isOpen,
  onClose,
  selectedClaim,
  allClaims = [],
  ediContent,
  cms1500Forms = [],
  csvContent,
  exportErrors = {},
}) => {
  const [activeTab, setActiveTab] = useState<"837p" | "cms1500" | "csv">(
    "837p",
  );
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTextFile = (
    filename: string,
    content: string,
    mimeType = "text/plain",
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Claims Export & Electronic Preview
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedClaim
                ? `Claim ${selectedClaim.claimNumber} • ${selectedClaim.clientName} (${selectedClaim.payorName})`
                : `Batch Export (${allClaims.length} items in queue)`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 px-6 pt-3 bg-white gap-2">
          <button
            onClick={() => setActiveTab("837p")}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "837p"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            ANSI 837P (EDI Electronic)
          </button>
          <button
            onClick={() => setActiveTab("cms1500")}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "cms1500"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <FileText className="h-4 w-4" />
            CMS-1500 (HCFA Form)
          </button>
          <button
            onClick={() => setActiveTab("csv")}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "csv"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Clearinghouse CSV Export
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {/* TAB 1: 837P EDI PREVIEW */}
          {activeTab === "837p" && exportErrors.edi && (
            <ExportBlocked message={exportErrors.edi} />
          )}
          {activeTab === "837p" && !exportErrors.edi && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 flex items-start justify-between">
                <div>
                  <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                    ANSI ASC X12 837P Professional Electronic Claim
                  </h4>
                  <p className="text-xs text-blue-800 mt-1">
                    5010 preview built from the invoice and its stored EVV
                    records (test indicator set). Identifiers not on file, such
                    as billing NPI and member ID, are left blank for completion
                    before submission.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(ediContent || "")}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white text-blue-700 border border-blue-300 rounded hover:bg-blue-50 transition-colors"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy EDI
                  </button>
                  <button
                    onClick={() =>
                      downloadTextFile(
                        `claim-${selectedClaim?.claimNumber || "batch"}.837p`,
                        ediContent || "",
                        "text/plain",
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download .837p
                  </button>
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 overflow-x-auto border border-gray-800 shadow-inner max-h-[380px]">
                <pre>{ediContent || "Loading 837P preview..."}</pre>
              </div>
            </div>
          )}

          {/* TAB 2: CMS-1500 FORM PREVIEW */}
          {activeTab === "cms1500" && exportErrors.cms1500 && (
            <ExportBlocked message={exportErrors.cms1500} />
          )}
          {activeTab === "cms1500" && !exportErrors.cms1500 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                <div>
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    CMS-1500 Health Insurance Claim Form
                  </h4>
                  <p className="text-xs text-gray-600">
                    Form CMS-1500 (02/12) standard professional paper claim
                    layout with EVV line verification.
                  </p>
                </div>
                <button
                  onClick={() =>
                    downloadTextFile(
                      `cms1500-${selectedClaim?.invoiceNumber ?? "claim"}.json`,
                      JSON.stringify(cms1500Forms, null, 2),
                      "application/json",
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Form Data
                </button>
              </div>

              {cms1500Forms.length > 0 ? (
                cms1500Forms.map((cms1500Data) => (
                  <div
                    key={cms1500Data.claimNumber}
                    className="bg-white rounded-lg border border-red-300 p-5 shadow-sm text-xs font-sans text-gray-800 space-y-4"
                  >
                    {/* Top Bar Form Header */}
                    <div className="border-b-2 border-red-500 pb-2 flex justify-between items-center">
                      <span className="font-bold text-red-700 text-sm tracking-wider">
                        HEALTH INSURANCE CLAIM FORM
                      </span>
                      <span className="text-[11px] text-gray-500">
                        APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC)
                      </span>
                    </div>

                    {/* Row 1: Box 1 & Box 2 */}
                    <div className="grid grid-cols-12 gap-3 border-b border-gray-200 pb-3">
                      <div className="col-span-4 border-r border-gray-200 pr-2">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">
                          1. MEDICARE / MEDICAID / TRICARE / OTHER
                        </p>
                        <p className="font-semibold text-gray-900 mt-1 uppercase">
                          {cms1500Data.box1_payerType}
                        </p>
                      </div>
                      <div className="col-span-5 border-r border-gray-200 pr-2">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">
                          2. PATIENT&apos;S NAME (Last, First, Middle)
                        </p>
                        <p className="font-semibold text-gray-900 mt-1">
                          {cms1500Data.box2_patientName}
                        </p>
                      </div>
                      <div className="col-span-3">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">
                          3. PATIENT&apos;S BIRTH DATE
                        </p>
                        <p className="font-semibold text-gray-900 mt-1">
                          {cms1500Data.box3_patientBirthDate}
                        </p>
                      </div>
                    </div>

                    {/* Row 2: Box 5 & Box 11 */}
                    <div className="grid grid-cols-12 gap-3 border-b border-gray-200 pb-3">
                      <div className="col-span-6 border-r border-gray-200 pr-2">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">
                          5. PATIENT&apos;S ADDRESS (Street, City, State, ZIP)
                        </p>
                        <p className="font-medium text-gray-800 mt-1">
                          {cms1500Data.box5_patientAddress}
                        </p>
                      </div>
                      <div className="col-span-6">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">
                          11. INSURED&apos;S POLICY GROUP OR FECA NUMBER
                        </p>
                        <p className="font-semibold text-gray-900 mt-1">
                          {cms1500Data.box11_insuredPolicyGroup}
                        </p>
                      </div>
                    </div>

                    {/* Row 3: Box 21 Diagnosis */}
                    <div className="border-b border-gray-200 pb-3">
                      <p className="text-[10px] font-bold text-gray-500 uppercase">
                        21. DIAGNOSIS OR NATURE OF ILLNESS OR INJURY (ICD-10-CM)
                      </p>
                      <div className="flex gap-4 mt-1 font-mono text-xs">
                        {cms1500Data.box21_diagnosisCodes.map((code, idx) => (
                          <span
                            key={code}
                            className="bg-gray-100 px-2 py-0.5 rounded font-bold"
                          >
                            {String.fromCharCode(65 + idx)}. {code}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Box 24 Service Lines */}
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">
                        24. SERVICE LINES (A. DATES • B. PLACE • D. PROCEDURES •
                        E. DIAG • F. CHARGES • G. UNITS)
                      </p>
                      <table className="w-full border border-gray-300 text-[11px]">
                        <thead className="bg-gray-100 border-b border-gray-300">
                          <tr>
                            <th className="p-1 text-left">Dates of Service</th>
                            <th className="p-1 text-center">Place</th>
                            <th className="p-1 text-left">CPT / HCPCS</th>
                            <th className="p-1 text-center">Mod</th>
                            <th className="p-1 text-right">Charges</th>
                            <th className="p-1 text-center">Units</th>
                            <th className="p-1 text-center">EVV Verified</th>
                            <th className="p-1 text-left">Rendering NPI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cms1500Data.box24_serviceLines.map((line, idx) => (
                            <tr key={idx} className="border-b border-gray-200">
                              <td className="p-1.5 font-mono">
                                {line.dateOfServiceFrom}
                              </td>
                              <td className="p-1.5 text-center">
                                {line.placeOfService}
                              </td>
                              <td className="p-1.5 font-bold">
                                {line.procedureCode}
                              </td>
                              <td className="p-1.5 text-center">
                                {line.modifiers.join(", ")}
                              </td>
                              <td className="p-1.5 text-right font-medium">
                                {formatCurrency(line.charges)}
                              </td>
                              <td className="p-1.5 text-center">
                                {line.daysOrUnits}
                              </td>
                              <td className="p-1.5 text-center">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                                  ✓ PASSED
                                </span>
                              </td>
                              <td className="p-1.5 font-mono">
                                {line.renderingProviderNpi}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals & Signatures */}
                    <div className="grid grid-cols-12 gap-3 pt-2">
                      <div className="col-span-6">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">
                          31. SIGNATURE OF PHYSICIAN OR SUPPLIER
                        </p>
                        <p className="text-xs text-gray-700 italic mt-1 font-serif">
                          {cms1500Data.box31_physicianSignature}
                        </p>
                      </div>
                      <div className="col-span-6 text-right">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">
                          28. TOTAL CHARGE
                        </p>
                        <p className="text-xl font-bold text-gray-900 mt-1">
                          {formatCurrency(cms1500Data.box28_totalCharge)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">
                  Select an invoiced, EVV-verified claim to preview the CMS-1500
                  form.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CSV EXPORT */}
          {activeTab === "csv" && exportErrors.csv && (
            <ExportBlocked message={exportErrors.csv} />
          )}
          {activeTab === "csv" && !exportErrors.csv && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 flex items-start justify-between">
                <div>
                  <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                    Clearinghouse Batch CSV File
                  </h4>
                  <p className="text-xs text-emerald-800 mt-1">
                    Comma-separated export of the claims queue. Claims that have
                    not passed the EVV gate are excluded.
                  </p>
                </div>
                <button
                  onClick={() =>
                    downloadTextFile(
                      "claims-queue-export.csv",
                      csvContent || "",
                      "text/csv",
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded hover:bg-emerald-800 transition-colors shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </button>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <div className="max-h-[350px] overflow-auto font-mono text-xs p-4 bg-gray-50">
                  <pre>{csvContent || "Loading CSV export data..."}</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-white flex justify-between items-center text-xs text-gray-500">
          <span>
            21st Century Cures Act § 12006 • Electronic Visit Verification (EVV)
            Gate Active
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
