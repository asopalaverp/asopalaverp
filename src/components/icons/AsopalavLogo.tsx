import React from 'react';
import { cn } from '@/lib/utils';

interface AsopalavLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number | string;
  monochrome?: boolean;
}

export const AsopalavLogo: React.FC<AsopalavLogoProps> = ({
  className,
  size = 24,
  monochrome = false,
  ...props
}) => {
  const gradId = 'asopalav-brand-gradient';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 select-none', className)}
      {...props}
    >
      {!monochrome && (
        <defs>
          <linearGradient id={gradId} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3ecf8e" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
        </defs>
      )}
      {/* Outer rounded diamond leaf frame */}
      <rect
        x="6"
        y="6"
        width="20"
        height="20"
        rx="5"
        transform="rotate(45 16 16)"
        fill={monochrome ? 'currentColor' : `url(#${gradId})`}
        fillOpacity={monochrome ? 0.15 : 0.2}
        stroke={monochrome ? 'currentColor' : '#3ecf8e'}
        strokeWidth="1.5"
      />
      {/* Inner geometric A / chevron pillar */}
      <path
        d="M16 8L22 20H18.5L16 14.5L13.5 20H10L16 8Z"
        fill={monochrome ? 'currentColor' : '#3ecf8e'}
      />
      {/* Center crossbar accent */}
      <circle cx="16" cy="18" r="1.5" fill={monochrome ? 'currentColor' : '#ffffff'} />
    </svg>
  );
};
