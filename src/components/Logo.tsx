import { BRAND_SVG, type BrandLogo } from '@/components/brand-svg';

/** Inline brand logo; colour follows the CSS `color` of its container. */
export function Logo({ variant, className, title }: { variant: BrandLogo; className?: string; title?: string }) {
  const { viewBox, paths } = BRAND_SVG[variant];
  return (
    <svg
      viewBox={viewBox}
      fill="currentColor"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
