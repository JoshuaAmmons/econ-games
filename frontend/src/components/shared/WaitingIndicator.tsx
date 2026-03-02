import React from 'react';
import { Users } from 'lucide-react';

interface WaitingIndicatorProps {
  /** Message like "Contribution Submitted!" */
  message: string;
  /** Number of players who have submitted */
  submitted: number;
  /** Total number of players */
  total: number;
}

/**
 * Compact waiting state shown after a player submits their action.
 * Features a progress ring and count — designed to be small on mobile.
 */
export const WaitingIndicator: React.FC<WaitingIndicatorProps> = ({
  message,
  submitted,
  total,
}) => {
  const progress = total > 0 ? submitted / total : 0;
  const circumference = 2 * Math.PI * 18; // r=18
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="text-center py-3 md:py-4">
      <div className="text-green-600 font-medium mb-3 text-sm md:text-base">{message}</div>
      <div className="flex flex-col items-center gap-2">
        {/* Progress ring */}
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 40 40">
            <circle
              cx="20" cy="20" r="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-gray-200"
            />
            <circle
              cx="20" cy="20" r="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="text-green-500 transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-gray-700">
              {submitted}/{total}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Users className="w-3.5 h-3.5" />
          <span>Waiting for others</span>
        </div>
      </div>
    </div>
  );
};
