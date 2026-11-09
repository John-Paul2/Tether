import { InboxIcon } from './ui/icons';

export function EmptyData() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-pale text-primary">
        <InboxIcon className="size-7" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-extrabold text-ink">
        No payment events recorded yet
      </h2>
      <p className="mt-2 max-w-md text-base text-body">
        Use the Demo controls panel above to create a PayPal sandbox order or receive your first webhook event.
      </p>
    </div>
  );
}
