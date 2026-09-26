import React from 'react';
import { useBrandStore } from '@/store/brandStore';
import { AsopalavLogo } from './AsopalavLogo';
import { cn } from '@/lib/utils';

import DOMPurify from 'dompurify';

/** Strip script tags and event handlers from SVG to prevent XSS */
const sanitizeSvg = (svg: string): string => {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['script', 'iframe', 'embed', 'object', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
};

interface BrandLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  monochrome?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className,
  size = 24,
  showText = false,
  monochrome = false,
}) => {
  const { brandName, logoUrl, logoType, brandSvgContent, monogramText, brandAccentColor } = useBrandStore();

  const numSize = typeof size === 'number' ? size : parseInt(String(size), 10) || 24;

  // 1. Custom Image URL
  if (logoType === 'image' && logoUrl) {
    return (
      <div className={cn('flex items-center gap-2 select-none', className)}>
        <img
          src={logoUrl}
          alt={brandName || 'Brand Logo'}
          style={{ width: numSize, height: numSize }}
          className="object-contain shrink-0 rounded-[4px]"
        />
        {showText && (
          <span className="font-medium text-xs text-slate-900 dark:text-white truncate font-sans">
            {brandName}
          </span>
        )}
      </div>
    );
  }

  // 2. Custom Raw SVG Content
  if (logoType === 'svg' && brandSvgContent && brandSvgContent.trim().startsWith('<svg')) {
    return (
      <div className={cn('flex items-center gap-2 select-none', className)}>
        <div
          style={{ width: numSize, height: numSize }}
          className="shrink-0 flex items-center justify-center"
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(brandSvgContent) }}
        />
        {showText && (
          <span className="font-medium text-xs text-slate-900 dark:text-white truncate font-sans">
            {brandName}
          </span>
        )}
      </div>
    );
  }

  // 3. Monogram / Badge mode
  if (logoType === 'monogram' && monogramText) {
    return (
      <div className={cn('flex items-center gap-2 select-none', className)}>
        <div
          style={{
            width: numSize,
            height: numSize,
            backgroundColor: monochrome ? 'currentColor' : brandAccentColor || '#3ecf8e',
            color: '#171717',
          }}
          className="rounded-[6px] flex items-center justify-center font-mono font-bold text-xs tracking-tight shrink-0 shadow-2xs"
        >
          {monogramText.slice(0, 3).toUpperCase()}
        </div>
        {showText && (
          <span className="font-medium text-xs text-slate-900 dark:text-white truncate font-sans">
            {brandName}
          </span>
        )}
      </div>
    );
  }

  // 4. Default Official Diamond Logo
  return (
    <div className={cn('flex items-center gap-2 select-none', className)}>
      <AsopalavLogo size={numSize} monochrome={monochrome} />
      {showText && (
        <span className="font-medium text-xs text-slate-900 dark:text-white truncate font-sans">
          {brandName}
        </span>
      )}
    </div>
  );
};

export default BrandLogo;
