import React from 'react';
import { BillingDashboard } from '../components/BillingDashboard';

/**
 * InvoiceList renders the comprehensive Billing & Claims Dashboard
 * with EVV validation gates, payor filtering, claims queue, and batch invoicing.
 */
export const InvoiceList: React.FC = () => {
  return <BillingDashboard />;
};

export { BillingDashboard };
