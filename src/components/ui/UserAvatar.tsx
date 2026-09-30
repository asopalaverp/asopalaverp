import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface UserAvatarProps {
  /** Image URL for uploaded profile photo */
  src?: string | null;
  /** User's First Name */
  firstName?: string | null;
  /** User's Last Name */
  lastName?: string | null;
  /** Fallback string / Full Name / Username */
  name?: string | null;
  /** Explicit pre-calculated initials */
  initials?: string | null;
  /** Size in pixels (e.g. 24, 28, 32, 36, 40, 44, 48, 64, 96) */
  size?: number;
  /** Shape geometry */
  shape?: 'circle' | 'square';
  /** Additional container classes */
  className?: string;
  /** Additional image classes */
  imgClassName?: string;
  /** Additional text classes */
  textClassName?: string;
  /** Alt text for image */
  alt?: string;
}

/**
 * Calculates deterministic 2-letter initials from First & Last name mix.
 * Example: First: "abc", Last: "yui" -> "AY"
 * Example: First: "Rekha", Last: "Trivedi" -> "RT"
 * Example: Full Name: "John Doe" -> "JD"
 */
export function computeUserInitials(
  firstName?: string | null,
  lastName?: string | null,
  name?: string | null,
  explicitInitials?: string | null
): string {
  if (explicitInitials && explicitInitials.trim()) {
    return explicitInitials.trim().slice(0, 2).toUpperCase();
  }

  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();

  // If both first and last name are provided: mix First[0] + Last[0]
  if (fn && ln) {
    return `${fn[0]}${ln[0]}`.toUpperCase();
  }

  // If only first name is provided
  if (fn) {
    const parts = fn.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return fn.slice(0, 2).toUpperCase();
  }

  // If only last name is provided
  if (ln) {
    return ln.slice(0, 2).toUpperCase();
  }

  // If general name/username is provided
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }

  return 'AS';
}

/**
 * Universal UserAvatar component for Asopalav ERP.
 * - Displays uploaded user profile photo if available.
 * - If no photo is uploaded (or image fails to load), displays a clean high-contrast
 *   signature #3ecf8e emerald badge with First Name + Last Name mixed initials (e.g. "AY").
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  firstName,
  lastName,
  name,
  initials,
  size = 36,
  shape = 'circle',
  className,
  imgClassName,
  textClassName,
  alt = 'User Avatar',
}) => {
  const [imageError, setImageError] = useState(false);

  // Reset image error state whenever src changes
  useEffect(() => {
    setImageError(false);
  }, [src]);

  const roundedClass = shape === 'circle' ? 'rounded-full' : 'rounded-[6px]';
  const displayInitials = computeUserInitials(firstName, lastName, name, initials);

  // Calculate proportional font size (~42% of avatar diameter)
  const dynamicFontSize = Math.max(9, Math.round(size * 0.42));

  // 1. Render uploaded photo if present and valid
  if (src && !imageError) {
    return (
      <div
        className={cn(
          'relative shrink-0 overflow-hidden flex items-center justify-center select-none bg-slate-100 dark:bg-[#1a1a1a]',
          roundedClass,
          className
        )}
        style={{ width: size, height: size }}
      >
        <img
          src={src}
          alt={alt}
          onError={() => setImageError(true)}
          className={cn(
            'w-full h-full object-cover shrink-0',
            roundedClass,
            imgClassName
          )}
        />
      </div>
    );
  }

  // 2. Fallback: Perfectly Proportioned First + Last Name Mixed Initials (e.g. "RT", "AY")
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden flex items-center justify-center select-none bg-[#3ecf8e] text-[#141414] font-sans font-bold tracking-tight shadow-xs',
        roundedClass,
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: `${dynamicFontSize}px`,
        lineHeight: 1,
      }}
      title={alt}
    >
      <span className={cn('leading-none select-none uppercase', textClassName)}>
        {displayInitials}
      </span>
    </div>
  );
};
