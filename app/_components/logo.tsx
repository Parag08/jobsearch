/**
 * The Stages mark (docs/DESIGN.md section 5): four dots rising, each more solid
 * than the last - the pipeline from `saved` to `offer`. The opacity ramp is the
 * same one the stage scale uses, so the mark and the interface share one logic.
 * Drawn in currentColor, so it inherits --accent or --ink from its context.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="7" cy="34" r="3.2" fill="currentColor" opacity="0.28" />
      <circle cx="17" cy="29" r="3.2" fill="currentColor" opacity="0.5" />
      <circle cx="27" cy="22" r="3.2" fill="currentColor" opacity="0.75" />
      <circle cx="38" cy="13" r="4.4" fill="currentColor" />
    </svg>
  );
}
