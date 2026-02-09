import React from 'react';
import { Clock } from 'lucide-react';

interface TimerProps {
  seconds: number;
}

export const Timer: React.FC<TimerProps> = ({ seconds }) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  const isLow = seconds < 30;

  return (
    <div className={`flex items-center gap-2 text-lg font-mono ${isLow ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>
      <Clock className="w-5 h-5" />
      <span>
        {minutes.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
      </span>
    </div>
  );
};
