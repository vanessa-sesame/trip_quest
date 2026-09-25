// Small reusable hand-drawn-feeling SVG doodles for the booklet preview —
// stars, sparkles, arrows, footprints, clouds. Pure decoration (no booklet
// content lives here), positioned by the caller via a wrapping element with
// className="jt-doodle" (see globals.css) rather than inline styles, so a
// page can scatter a few without each one becoming a bespoke one-off.
// Mirrors the same restrained vocabulary as the printable PDF's
// app/lib/pdf/illustrations.ts doodle primitives (drawHandLine, drawStampCircle,
// etc.) — same idea, translated into SVG for the browser.

type DoodleProps = {
  className?: string;
};

export function DoodleStar({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 3 L19 13 L29 16 L19 19 L16 29 L13 19 L3 16 L13 13 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function DoodleSparkle({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 L13.4 9.6 L21 11 L13.4 12.4 L12 20 L10.6 12.4 L3 11 L10.6 9.6 Z" fill="currentColor" />
      <circle cx="19.5" cy="4.5" r="1.4" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

export function DoodleArrow({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 48 24" fill="none" aria-hidden="true">
      <path
        d="M2 14 C 14 6, 28 20, 40 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M32 7 L41 10 L37 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function DoodleFootprints({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 60 24" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="16" rx="4.5" ry="6.5" fill="currentColor" opacity="0.85" transform="rotate(-12 8 16)" />
      <circle cx="12.5" cy="8" r="1.6" fill="currentColor" opacity="0.85" />
      <ellipse cx="28" cy="8" rx="4.5" ry="6.5" fill="currentColor" opacity="0.85" transform="rotate(10 28 8)" />
      <circle cx="24" cy="1.5" r="1.6" fill="currentColor" opacity="0.85" />
      <ellipse cx="48" cy="16" rx="4.5" ry="6.5" fill="currentColor" opacity="0.85" transform="rotate(-12 48 16)" />
      <circle cx="52.5" cy="8" r="1.6" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function DoodleCloud({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 48 28" fill="none" aria-hidden="true">
      <path
        d="M12 20 a7 7 0 0 1 -1-13.9 A8 8 0 0 1 26 4.3 A6.5 6.5 0 0 1 36 9.8 A6 6 0 0 1 35 20 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function DoodleMapPin({ className }: DoodleProps) {
  return (
    <svg className={className} viewBox="0 0 24 30" fill="none" aria-hidden="true">
      <path
        d="M12 2 C6.5 2 2 6.4 2 11.8 C2 19 12 28 12 28 C12 28 22 19 22 11.8 C22 6.4 17.5 2 12 2 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12" cy="11.6" r="3.4" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}
