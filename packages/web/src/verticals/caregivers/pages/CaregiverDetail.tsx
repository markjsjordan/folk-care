/**
 * Caregiver Detail Page
 *
 * Renders the full caregiver record (credentials, training, compliance
 * status) using the existing useCaregiver(id) hook, and links out to the
 * existing /caregivers/:id/training route.
 */
import React from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Calendar, Briefcase, GraduationCap, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/core/components';
import { Button, StatusBadge, LoadingSpinner, ErrorMessage } from '@/core/components';
import { formatDate, formatPhone } from '@/core/utils';
import { useCaregiver } from '../hooks/index.js';

export const CaregiverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: caregiver, isLoading, error, refetch } = useCaregiver(id);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !caregiver) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorMessage
          message={(error as Error)?.message || 'Failed to load caregiver'}
          retry={refetch}
        />
      </div>
    );
  }

  const fullName = [caregiver.firstName, caregiver.middleName, caregiver.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/caregivers')}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Back to caregivers"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {caregiver.preferredName || fullName}
            </h1>
            <StatusBadge status={caregiver.status} />
          </div>
          <p className="text-gray-600 mt-1">
            {caregiver.employeeNumber} &middot; {caregiver.role}
          </p>
        </div>
        <Link to={`/caregivers/${caregiver.id}/training`}>
          <Button variant="outline" leftIcon={<GraduationCap className="h-4 w-4" />}>
            Training & Compliance
          </Button>
        </Link>
      </div>

      {/* Contact */}
      <Card padding="md">
        <CardHeader title="Contact" />
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Mail className="h-4 w-4 text-gray-400" />
              <span>{caregiver.email}</span>
            </div>
            {caregiver.primaryPhone && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Phone className="h-4 w-4 text-gray-400" />
                <span>{formatPhone(caregiver.primaryPhone.number)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>Hired: {formatDate(caregiver.hireDate)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Briefcase className="h-4 w-4 text-gray-400" />
              <span>{caregiver.employmentType?.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance */}
      <Card padding="md">
        <CardHeader
          title="Compliance Status"
          action={<ShieldCheck className="h-5 w-5 text-gray-400" />}
        />
        <CardContent>
          <div className="flex items-center gap-3">
            <StatusBadge status={caregiver.complianceStatus} />
            <span className="text-sm text-gray-500">
              {caregiver.complianceStatus === 'COMPLIANT'
                ? 'All credentials and training up to date'
                : 'Review credentials and training below'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card padding="md">
        <CardHeader title="Credentials" />
        <CardContent>
          {caregiver.credentials && caregiver.credentials.length > 0 ? (
            <div className="space-y-3">
              {caregiver.credentials.map((credential) => (
                <div
                  key={credential.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{credential.name}</p>
                    <p className="text-xs text-gray-500">
                      {credential.type}
                      {credential.expirationDate &&
                        ` · Expires ${formatDate(credential.expirationDate)}`}
                    </p>
                  </div>
                  <StatusBadge status={credential.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No credentials on file.</p>
          )}
        </CardContent>
      </Card>

      {/* Training */}
      <Card padding="md">
        <CardHeader
          title="Training"
          action={
            <Link
              to={`/caregivers/${caregiver.id}/training`}
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              View full training dashboard &rarr;
            </Link>
          }
        />
        <CardContent>
          {caregiver.training && caregiver.training.length > 0 ? (
            <div className="space-y-3">
              {caregiver.training.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{record.name}</p>
                    <p className="text-xs text-gray-500">
                      {record.category} &middot; Completed {formatDate(record.completionDate)}
                    </p>
                  </div>
                  <StatusBadge status={record.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No training records on file.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
