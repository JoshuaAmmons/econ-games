import React, { useEffect } from 'react';
import { Clock } from 'lucide-react';

interface TimerProps {
  seconds: number;
  /** Render as a fixed floating pill on mobile */
  floating?: boolean;
}

export const Timer: React.FC<TimerProps> = ({ seconds, floating = false }) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  const isLow = seconds < 30;
  const isCritical = seconds <= 10;

  // Haptic feedback at critical thresholds
  useEffect(() => {
    if ((seconds === 10 || seconds === 5) && navigator.vibrate) {
      navigator.vibrate(seconds === 5 ? [200, 100, 200] : 200);
    }
  }, [seconds]);

  const timerContent = (
    <>
      <Clock className="w-5 h-5" />
      <span>
        {minutes.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
      </span>
    </>
  );

  if (floating) {
    return (
      <div
        className={`fixed top-2 right-2 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-sm shadow-lg backdrop-blur-sm md:hidden ${
          isCritical
            ? 'bg-red-600/90 text-red-950 animate-pulse'
            : isLow
            ? 'bg-red-500/80 text-red-950 animate-pulse'
            : 'bg-gray-300/80 text-gray-900'
        }`}
        style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
      >
        {timerContent}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-lg font-mono ${isLow ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>
      {timerContent}
    </div>
  );
};
