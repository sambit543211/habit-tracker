import { useState } from 'react';
import { signOut, useSync } from '../sync';

/** Account + sync status, shown at the bottom of the Habits tab. */
export function AccountCard() {
  const { session, status, pending } = useSync();
  const [confirm, setConfirm] = useState(false);
  if (!session) return null;

  const label =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'offline'
        ? `Offline · ${pending} change${pending === 1 ? '' : 's'} waiting`
        : status === 'error' || pending
          ? `Couldn't sync yet · will retry`
          : 'All changes synced';
  const dot = status === 'idle' && !pending ? 'var(--habit)' : status === 'syncing' ? 'var(--plan)' : 'var(--gold)';

  return (
    <section className="card mt-2 px-4 py-4">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Account</h2>
      <div className="mt-2 truncate text-[15px] font-medium">{session.user.email}</div>
      <div className="mt-1 flex items-center gap-2 text-[13px] text-muted">
        <span className="size-2 rounded-full" style={{ background: dot }} />
        {label}
      </div>
      <button
        onClick={() => {
          if (!confirm) return setConfirm(true);
          void signOut();
        }}
        className={`mt-3 text-[14px] font-medium ${confirm ? 'text-miss' : 'text-faint'}`}
      >
        {confirm ? 'Tap again to sign out' : 'Sign out'}
      </button>
    </section>
  );
}
