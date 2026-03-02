import React from 'react';
import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  type,
  step,
  ...props
}) => {
  // Derive mobile-friendly inputMode from type/step
  const inputMode = type === 'number'
    ? (step && parseFloat(String(step)) % 1 !== 0 ? 'decimal' as const : 'numeric' as const)
    : undefined;

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <input
        type={type}
        step={step}
        inputMode={inputMode}
        className={clsx(
          'w-full px-3 py-3 md:py-2 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500',
          error ? 'border-red-500' : 'border-gray-300',
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};
