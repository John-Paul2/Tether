'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';

// Tether Noir UI primitives (TETHER_THEME_AND_DESIGN.md):
// - 999px radius (rounded-full) on buttons and pills, 12px on cards/menus/dialogs
// - Primary button: single filled action (--accent fill, dark --text-on-accent text)
// - Secondary/tertiary: surface/raised with 1px --border / --border-strong
// - Soft-tint badges with full-strength state text

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-strong disabled:border disabled:border-line disabled:bg-transparent disabled:text-fg-3',
  secondary:
    'border border-line bg-raised text-fg hover:border-line-strong hover:bg-surface disabled:border-line disabled:bg-surface disabled:text-fg-3',
  tertiary:
    'border border-line-strong bg-surface text-fg hover:bg-raised disabled:border-line disabled:text-fg-3',
  ghost:
    'text-fg-2 hover:bg-raised hover:text-fg disabled:text-fg-3',
  danger:
    'bg-drift-solid text-on-solid hover:brightness-110 disabled:border disabled:border-line disabled:bg-transparent disabled:text-fg-3',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizing =
    size === 'sm'
      ? 'px-3.5 py-1.5 text-sm leading-5'
      : 'px-5 py-2.5 text-base leading-6';
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className = '',
  ...props
}: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:text-fg-3 disabled:hover:bg-transparent ${className}`}
      {...props}
    />
  );
}

export type BadgeTone = 'positive' | 'info' | 'warning' | 'negative';

const BADGE_STYLES: Record<BadgeTone, string> = {
  positive: 'bg-sync-soft text-sync',
  info: 'bg-ai-soft text-ai',
  warning: 'bg-warn-soft text-warn-ink',
  negative: 'bg-drift-soft text-drift',
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${BADGE_STYLES[tone]} ${className}`}
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
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-[var(--radius-card)] border border-line-strong bg-surface p-0 font-sans text-fg shadow-[var(--shadow-popover)] backdrop:bg-[var(--scrim)]"
    >
      {open && (
        <div className="p-6">
          <h2 className="type-h2 text-fg">{title}</h2>
          <div className="mt-3 text-sm leading-relaxed text-fg-2">{children}</div>
          <div className="mt-6 flex flex-wrap justify-end gap-2.5">{actions}</div>
        </div>
      )}
    </dialog>
  );
}

export function Menu({
  open,
  onClose,
  triggerRef,
  align = 'right',
  label,
  className = '',
  children,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  align?: 'left' | 'right';
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;

    const items = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [],
      );

    requestAnimationFrame(() => {
      items()[0]?.focus();
    });

    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !triggerRef?.current?.contains(target)) {
        close();
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        triggerRef?.current?.focus();
        return;
      }
      const list = items();
      if (list.length === 0) return;
      const idx = list.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        list[(idx + 1) % list.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        list[(idx - 1 + list.length) % list.length]?.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        list[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        list[list.length - 1]?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, triggerRef]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`absolute top-full z-30 mt-2 w-56 overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-surface py-1.5 shadow-[var(--shadow-popover)] ${
        align === 'left' ? 'left-0' : 'right-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  danger,
  className = '',
  ...props
}: ComponentProps<'button'> & { danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:opacity-45 ${
        danger
          ? 'text-drift hover:bg-drift-soft disabled:hover:bg-transparent'
          : 'text-fg hover:bg-[var(--glass-item-hover)] disabled:hover:bg-transparent'
      } ${className}`}
      {...props}
    />
  );
}

export function MenuDivider() {
  return <div role="separator" className="my-1.5 border-t border-[var(--glass-border)]" />;
}
