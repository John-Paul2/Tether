'use client';

import { useEffect, useEffectEvent, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

// Tether UI building blocks following DESIGN.md:
// - 24px radius (rounded-[24px]) on buttons and cards
// - Primary button: #0070E0 (--primary), white label (--on-primary), hover #003087 (--primary-active),
//   disabled state is --canvas-soft with --mute text
// - Secondary button: --canvas-soft fill, --ink text
// - Tertiary button: --canvas fill, 1px --ink border, --ink text
// - Pill badges: positive, info, warning, negative
// - No drop shadows; elevation comes from surface contrast (--canvas on --canvas-soft)

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-active disabled:bg-canvas-soft disabled:text-mute',
  secondary:
    'bg-canvas-soft text-ink hover:bg-primary-pale disabled:bg-canvas-soft disabled:text-mute',
  tertiary:
    'border border-ink bg-canvas text-ink hover:bg-primary-pale disabled:border-canvas-soft disabled:text-mute',
  ghost:
    'text-primary hover:bg-primary-pale disabled:text-mute',
  danger:
    'bg-negative text-on-primary hover:bg-negative-deep disabled:bg-canvas-soft disabled:text-mute',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizing =
    size === 'sm'
      ? 'px-4 py-2 text-sm leading-5'
      : 'px-6 py-3 text-base leading-6';
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-[24px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-active disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-primary-pale focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-active disabled:cursor-not-allowed disabled:text-mute disabled:hover:bg-transparent ${className}`}
      {...props}
    />
  );
}

export type BadgeTone = 'positive' | 'info' | 'warning' | 'negative';

const BADGE_STYLES: Record<BadgeTone, string> = {
  positive: 'bg-positive-bg text-positive-deep',
  info: 'bg-primary-pale text-primary-active',
  warning: 'bg-warning-bg text-warning-content',
  negative: 'bg-negative-bg text-on-primary',
};

export function Badge({
  tone,
  children,
  className = '',
}: {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold leading-5 ${BADGE_STYLES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Dialog({
  open,
  title,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-[24px] border border-canvas-soft bg-canvas p-0 font-sans text-ink backdrop:bg-ink/40"
    >
      {open && (
        <div className="p-6">
          <h2 className="text-xl font-semibold tracking-[-0.2px] text-ink">{title}</h2>
          <div className="mt-3 text-base text-body">{children}</div>
          <div className="mt-6 flex flex-wrap justify-end gap-3">{actions}</div>
        </div>
      )}
    </dialog>
  );
}

export function Menu({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-[16px] border border-canvas-soft bg-canvas py-1.5"
    >
      {children}
    </div>
  );
}

export function MenuItem({
  danger,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`block w-full px-4 py-2 text-left text-sm font-semibold hover:bg-primary-pale focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-active ${
        danger ? 'text-negative' : 'text-ink'
      }`}
      {...props}
    />
  );
}
