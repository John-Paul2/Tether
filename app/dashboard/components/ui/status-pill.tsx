'use client';

export type StatusPillTone = 'sync' | 'drift' | 'warn' | 'ai' | 'paypal' | 'neutral';

export type StatusPillVariant =
  | 'PAID'
  | 'CREATED'
  | 'Drift'
  | 'In sync'
  | 'Verified'
  | 'Not confirmed';

const VARIANT_TONES: Record<StatusPillVariant, StatusPillTone> = {
  PAID: 'sync',
  CREATED: 'warn',
  Drift: 'drift',
  'In sync': 'sync',
  Verified: 'sync',
  'Not confirmed': 'warn',
};

const TONE_CLASSES: Record<StatusPillTone, { wrap: string; dot: string }> = {
  sync: {
    wrap: 'bg-sync-soft text-sync',
    dot: 'bg-sync-solid',
  },
  drift: {
    wrap: 'bg-drift-soft text-drift',
    dot: 'bg-drift-solid',
  },
  warn: {
    wrap: 'bg-warn-soft text-warn-ink',
    dot: 'bg-warn',
  },
  ai: {
    wrap: 'bg-ai-soft text-ai',
    dot: 'bg-ai',
  },
  paypal: {
    wrap: 'bg-paypal-soft text-paypal',
    dot: 'bg-paypal',
  },
  neutral: {
    wrap: 'border border-line bg-raised text-fg-2',
    dot: 'bg-fg-3',
  },
};

export function StatusPill({
  variant,
  tone,
  label,
  className = '',
}: {
  variant?: StatusPillVariant;
  tone?: StatusPillTone;
  label?: string;
  className?: string;
}) {
  const resolvedLabel = label ?? variant ?? '';
  const resolvedTone: StatusPillTone =
    tone ?? (variant ? VARIANT_TONES[variant] : 'neutral');
  const styles = TONE_CLASSES[resolvedTone];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap ${styles.wrap} ${className}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden />
      <span>{resolvedLabel}</span>
    </span>
  );
}
