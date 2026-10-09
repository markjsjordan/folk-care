import React from 'react';

export interface SummaryCardProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'indigo';
  subtitle?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  count,
  icon,
  color = 'blue',
  subtitle,
  onClick,
  isActive = false,
}) => {
  const colorStyles = {
    blue: {
      text: 'text-blue-600',
      activeRing: 'border-blue-500 ring-2 ring-blue-300 bg-blue-50/50 shadow-md',
      activeBadge: 'bg-blue-600 text-white',
    },
    green: {
      text: 'text-green-600',
      activeRing: 'border-green-500 ring-2 ring-green-300 bg-green-50/50 shadow-md',
      activeBadge: 'bg-green-600 text-white',
    },
    yellow: {
      text: 'text-amber-600',
      activeRing: 'border-amber-500 ring-2 ring-amber-300 bg-amber-50/50 shadow-md',
      activeBadge: 'bg-amber-600 text-white',
    },
    purple: {
      text: 'text-purple-600',
      activeRing: 'border-purple-500 ring-2 ring-purple-300 bg-purple-50/50 shadow-md',
      activeBadge: 'bg-purple-600 text-white',
    },
    red: {
      text: 'text-red-600',
      activeRing: 'border-red-500 ring-2 ring-red-300 bg-red-50/50 shadow-md',
      activeBadge: 'bg-red-600 text-white',
    },
    indigo: {
      text: 'text-indigo-600',
      activeRing: 'border-indigo-500 ring-2 ring-indigo-300 bg-indigo-50/50 shadow-md',
      activeBadge: 'bg-indigo-600 text-white',
    },
  }[color];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`p-5 rounded-lg border transition-all cursor-pointer select-none text-left focus:outline-none ${
        isActive
          ? colorStyles.activeRing
          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
      aria-pressed={isActive}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 truncate">
              {title}
            </p>
            {isActive && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colorStyles.activeBadge}`}>
                Active
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-lg bg-gray-50 ${colorStyles.text} flex-shrink-0 ml-3`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
