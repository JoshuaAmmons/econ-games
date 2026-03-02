import React from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className,
  ...props
}) => {
  const baseStyles = 'font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const variantStyles = {
    primary: 'bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-900',
    danger: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white',
  };

  // Mobile-first: generous touch targets, scale down on md+
  const sizeStyles = {
    sm: 'px-3 py-2 text-sm md:py-1.5',
    md: 'px-5 py-3 text-base md:px-4 md:py-2',
    lg: 'px-6 py-3.5 text-lg md:py-3',
  };

  return (
    <button
      className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    >
      {children}
    </button>
  );
};
