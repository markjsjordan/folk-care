import React from 'react';
import { CustomLoginForm } from '@/app/components/CustomLoginForm';

export const Login: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-3">
            Marquette Home Care
          </h1>
        </div>

        {/* Custom Login Form */}
        <CustomLoginForm />
      </div>
    </div>
  );
};
