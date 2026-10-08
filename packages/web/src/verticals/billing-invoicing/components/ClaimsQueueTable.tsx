import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileText,
  AlertCircle,
  CheckCircle,
  Eye,
  Info,
  Clock,
  MapPin,
  User,
  Calendar,
} from 'lucide-react';
import type { ClaimsQueueItem, ClaimStatus } from '../types';
import { formatCurrency, formatDate } from '../utils';

interface ClaimsQueueTableProps {
  claims: ClaimsQueueItem[];
  selectedClaimIds: string[];
  onSelectClaim: (claimId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onViewExport: (claim: ClaimsQueueItem) => void;
}

export const ClaimsQueueTable: React.FC<ClaimsQueueTableProps> = ({
  claims,
  selectedClaimIds,
  onSelectClaim,
  onSelectAll,
  onViewExport,
}) => {
  const [activeEvvModal, setActiveEvvModal] = useState<ClaimsQueueItem | null>(null);

  const allSelected = claims.length > 0 && selectedClaimIds.length === claims.length;

  const renderStatusBadge = (status: ClaimStatus, rejectionReason?: string) => {
    switch (status) {
      case 'EVV_INCOMPLETE':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm"
            title="Blocked by 21st Century Cures Act EVV Gate. Missing GPS or required data points."
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-700" />
            EVV_INCOMPLETE
          </span>
        );
      case 'VERIFIED_READY':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-900 border border-green-300 shadow-sm"
            title="All 6 Cures Act data points and GPS geofence confirmed. Ready to submit."
          >
            <ShieldCheck className="h-3.5 w-3.5 text-green-700" />
            VERIFIED_READY
          </span>
        );
      case 'BILLED':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300"
            title="Submitted to payer clearinghouse"
          >
            <Clock className="h-3.5 w-3.5 text-blue-700" />
            BILLED
          </span>
        );
      case 'PAID':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300"
            title="Payment reconciled"
          >
            <CheckCircle className="h-3.5 w-3.5 text-emerald-700" />
            PAID
          </span>
        );
      case 'REJECTED':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300"
            title={rejectionReason || 'Claim rejected by payor'}
          >
            <AlertCircle className="h-3.5 w-3.5 text-rose-700" />
            REJECTED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        );
    }
  };

  const renderPayorBadge = (payorType: string, payorName: string) => {
    let colorClasses = 'bg-gray-100 text-gray-800 border-gray-200';
    let label = payorType;

    if (payorType === 'MEDICAID' || payorType === 'MANAGED_CARE') {
      colorClasses = 'bg-indigo-50 text-indigo-800 border-indigo-200';
      label = 'Medicaid MCO';
    } else if (payorType === 'MEDICARE' || payorType === 'MEDICARE_ADVANTAGE') {
      colorClasses = 'bg-sky-50 text-sky-800 border-sky-200';
      label = 'Medicare';
    } else if (payorType === 'PRIVATE_PAY') {
      colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      label = 'Private Pay';
    } else if (payorType === 'VETERANS_BENEFITS') {
      colorClasses = 'bg-amber-50 text-amber-800 border-amber-200';
      label = 'VA';
    }

    return (
      <div>
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${colorClasses}`}>
          {label}
        </span>
        <p className="text-xs text-gray-600 truncate max-w-[180px] mt-0.5" title={payorName}>
          {payorName}
        </p>
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th scope="col" className="w-10 px-4 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    aria-label="Select all claims"
                  />
                </th>
                <th scope="col" className="px-4 py-3.5">Claim # / DOS</th>
                <th scope="col" className="px-4 py-3.5">Client (Patient)</th>
                <th scope="col" className="px-4 py-3.5">Caregiver</th>
                <th scope="col" className="px-4 py-3.5">Service Code</th>
                <th scope="col" className="px-4 py-3.5 text-right">Units / Rate</th>
                <th scope="col" className="px-4 py-3.5 text-right">Amount</th>
                <th scope="col" className="px-4 py-3.5">Payor</th>
                <th scope="col" className="px-4 py-3.5">EVV Compliance</th>
                <th scope="col" className="px-4 py-3.5">Status</th>
                <th scope="col" className="px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-500">
                    <FileText className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm font-medium text-gray-900">No claims match the selected criteria</p>
                    <p className="text-xs text-gray-500 mt-1">Try switching payor filters or clearing the search box</p>
                  </td>
                </tr>
              ) : (
                claims.map((claim) => {
                  const isSelected = selectedClaimIds.includes(claim.id);
                  const isBlocked = claim.status === 'EVV_INCOMPLETE';

                  return (
                    <tr
                      key={claim.id}
                      className={`hover:bg-gray-50/80 transition-colors ${
                        isBlocked ? 'bg-amber-50/20' : ''
                      } ${isSelected ? 'bg-blue-50/40' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onSelectClaim(claim.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          aria-label={`Select claim ${claim.claimNumber}`}
                        />
                      </td>

                      {/* Claim # and DOS */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="font-mono font-bold text-gray-900">{claim.claimNumber}</p>
                        <p className="text-gray-500 text-[11px] mt-0.5">
                          {formatDate(claim.serviceDate)}
                        </p>
                      </td>

                      {/* Patient Name */}
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-gray-900">{claim.clientName}</p>
                        {claim.clientMedicaidId && (
                          <p className="font-mono text-[10px] text-gray-500">
                            {claim.clientMedicaidId}
                          </p>
                        )}
                      </td>

                      {/* Caregiver */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-gray-700">
                        {claim.caregiverName}
                      </td>

                      {/* Service Code & Description */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                          {claim.serviceCode}
                        </span>
                        <p className="text-[11px] text-gray-600 truncate max-w-[160px] mt-0.5" title={claim.serviceDescription}>
                          {claim.serviceDescription}
                        </p>
                      </td>

                      {/* Units / Rate */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className="font-medium">{claim.units} {claim.unitType.toLowerCase()}s</span>
                        <p className="text-[11px] text-gray-500">@{formatCurrency(claim.unitRate)}</p>
                      </td>

                      {/* Total Amount */}
                      <td className="px-4 py-3.5 text-right font-bold text-gray-900 whitespace-nowrap">
                        {formatCurrency(claim.totalAmount)}
                      </td>

                      {/* Payor */}
                      <td className="px-4 py-3.5">
                        {renderPayorBadge(claim.payorType, claim.payorName)}
                      </td>

                      {/* EVV Gate Checklist */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setActiveEvvModal(claim)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                            claim.evvValidation.isValid
                              ? 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
                              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {claim.evvValidation.isValid ? (
                            <>
                              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                              <span>6/6 Elements • GPS Passed</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                              <span>
                                {claim.evvValidation.missingElements.length > 0
                                  ? `Incomplete (${claim.evvValidation.missingElements.length} missing)`
                                  : 'GPS not verified'}
                              </span>
                            </>
                          )}
                          <Info className="h-3 w-3 ml-0.5 opacity-70" />
                        </button>
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {renderStatusBadge(claim.status, claim.rejectionReason)}
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onViewExport(claim)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                            claim.status === 'EVV_INCOMPLETE'
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50 shadow-sm'
                          }`}
                          title={
                            claim.status === 'EVV_INCOMPLETE'
                              ? 'Export blocked: Resolve EVV verification first'
                              : 'Preview 837P / CMS-1500 claim'
                          }
                          disabled={claim.status === 'EVV_INCOMPLETE'}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EVV Verification Diagnostic Modal */}
      {activeEvvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-lg w-full p-6 animate-in fade-in duration-150">
            <div className="flex justify-between items-start pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                  EVV Compliance Diagnostic
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  21st Century Cures Act § 12006 (42 CFR § 440.387)
                </p>
              </div>
              <button
                onClick={() => setActiveEvvModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              {/* Visit overview */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 border border-gray-200">
                <div className="flex justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><User className="h-3 w-3" /> Patient:</span>
                  <span className="font-semibold">{activeEvvModal.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><Calendar className="h-3 w-3" /> Date of Service:</span>
                  <span className="font-semibold">{formatDate(activeEvvModal.serviceDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><MapPin className="h-3 w-3" /> Payor:</span>
                  <span className="font-semibold">{activeEvvModal.payorName}</span>
                </div>
              </div>

              {/* Six Elements Breakdown */}
              <div>
                <h4 className="font-bold text-gray-900 mb-2 uppercase tracking-wider text-[11px]">
                  Six Mandatory Data Points
                </h4>
                <div className="space-y-1.5">
                  {[
                    { label: '1. Service Type', passed: activeEvvModal.evvValidation.details.serviceTypePresent, value: activeEvvModal.serviceCode },
                    { label: '2. Client Identity', passed: activeEvvModal.evvValidation.details.clientPresent, value: activeEvvModal.clientName },
                    { label: '3. Caregiver Identity', passed: activeEvvModal.evvValidation.details.caregiverPresent, value: activeEvvModal.caregiverName },
                    { label: '4. Service Date', passed: activeEvvModal.evvValidation.details.serviceDatePresent, value: formatDate(activeEvvModal.serviceDate) },
                    { label: '5. Location of Service', passed: activeEvvModal.evvValidation.details.serviceLocationPresent, value: 'Client Residence Verified' },
                    { label: '6. Time Begins & Ends', passed: activeEvvModal.evvValidation.details.serviceTimePresent, value: `${activeEvvModal.units} hours duration` },
                  ].map((elem, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-gray-50 border border-gray-200/80">
                      <span className="text-gray-700 font-medium">{elem.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">{elem.value}</span>
                        {elem.passed ? (
                          <span className="text-green-600 font-bold">✓ PASSED</span>
                        ) : (
                          <span className="text-red-600 font-bold">✗ MISSING</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Geofence & Location Status */}
              <div>
                <h4 className="font-bold text-gray-900 mb-2 uppercase tracking-wider text-[11px]">
                  GPS Geofence & Location Verification
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-2.5 rounded border ${
                    activeEvvModal.evvValidation.details.clockInGeofencePassed
                      ? 'bg-green-50 border-green-200 text-green-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}>
                    <p className="font-semibold">Clock-In GPS</p>
                    <p className="text-[11px] mt-0.5">
                      {activeEvvModal.evvValidation.details.clockInGeofencePassed
                        ? 'Confirmed within 100m geofence'
                        : 'Outside geofence or missing'}
                    </p>
                  </div>
                  <div className={`p-2.5 rounded border ${
                    activeEvvModal.evvValidation.details.clockOutGeofencePassed
                      ? 'bg-green-50 border-green-200 text-green-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}>
                    <p className="font-semibold">Clock-Out GPS</p>
                    <p className="text-[11px] mt-0.5">
                      {activeEvvModal.evvValidation.details.clockOutGeofencePassed
                        ? 'Confirmed within 100m geofence'
                        : 'Outside geofence or missing'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Errors & Diagnostic Notice */}
              {activeEvvModal.evvValidation.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
                  <p className="font-bold mb-1">Billing Gate Restriction:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {activeEvvModal.evvValidation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setActiveEvvModal(null)}
                className="px-4 py-2 text-xs font-semibold bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                Close Diagnostic
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
