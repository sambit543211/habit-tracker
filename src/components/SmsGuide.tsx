import type { ReactNode } from 'react';
import { Sheet } from './Sheet';
import { useUI } from '../store';
import { APP_NAME } from '../config';

const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-text">{children}</b>;

/** How to make iPhone forward bank debit SMS to Sky (Shortcuts → Automation → Message). */
export function SmsGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const showToast = useUI((s) => s.showToast);
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      showToast(`“${t}” copied`, { tone: 'plan' });
    } catch {
      showToast("Couldn't copy — type it instead", { tone: 'miss' });
    }
  };
  const Copy = ({ t }: { t: string }) => (
    <button onClick={() => void copy(t)} className="mx-0.5 rounded-md bg-plan/15 px-1.5 py-0.5 font-mono text-[12.5px] text-plan">
      {t} ⧉
    </button>
  );
  const steps: ReactNode[] = [
    <>
      Set up <B>Hey Siri, {APP_NAME}</B> first (above). You'll reuse that shortcut.
    </>,
    <>
      In <B>Shortcuts</B>, long-press your <B>{APP_NAME}</B> shortcut → <B>Duplicate</B>. Rename the copy <Copy t={`${APP_NAME} SMS`} />.
    </>,
    <>
      In the copy, <B>delete “Dictate Text”</B>. In Get Contents of URL → Request Body, tap the <B>text</B> value and pick <B>Shortcut Input</B>. Then <B>Add new field → Text</B>: key <Copy t="source" />, value <Copy t="sms" />.
    </>,
    <>
      Delete <B>Speak Text</B>. Add <B>If</B>: <B>Contents of URL</B> · <B>contains</B> · <Copy t="what was it" />.
    </>,
    <>
      Inside the If, add <B>Ask for Input</B> — tap Prompt and pick <B>Contents of URL</B> (so it shows “₹424 to Google India — what was it?”).
    </>,
    <>
      Below it, still inside the If: long-press your <B>Get Contents of URL</B> → <B>Duplicate</B>, drag the copy under Ask for Input. In the copy set <B>text</B> = <B>Provided Input</B> and <B>source</B> = <Copy t="sort" />. Then add <B>Show Notification</B> with its result.
    </>,
    <>
      In <B>Otherwise</B>, add <B>Show Notification</B> with <B>Contents of URL</B> (for “matches your entry ✓” replies).
    </>,
    <>
      <B>Automation</B> tab → <B>+</B> → <B>Message</B> → Message Contains <Copy t="Sent Rs" /> (HDFC UPI) → <B>Run Immediately</B> → Run Shortcut <B>{APP_NAME} SMS</B> with input <B>Message</B>.
    </>,
    <>
      Card payments too? Make the same automation for <Copy t="debited" /> (and <Copy t="spent" /> if your card SMS says that).
    </>,
  ];
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="text-[13px] font-medium tracking-wide text-plan uppercase">Auto-log payments</div>
      <h2 className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em]">Bank SMS → {APP_NAME}</h2>
      <p className="mt-1 text-[14px] text-muted">
        When your bank texts “Sent Rs.424… To Google India”, {APP_NAME} logs it and <B>asks you what it was</B> — answer “subscription”, “groceries”, “chai”… If you already told {APP_NAME} about it, it's matched instead of logged twice.
      </p>
      <ol className="mt-4 flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-muted">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-bold text-text">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-2xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-faint">
        🔒 {APP_NAME} never reads your inbox — your iPhone sends only messages with those words, only to your own {APP_NAME}. Credits and OTPs are ignored, the same SMS is never logged twice, and the date written in the SMS is used. Didn't answer? It waits in <B>To sort</B>.
      </p>
      <button onClick={onClose} className="mt-5 min-h-12 w-full rounded-2xl bg-surface-2 text-[15px] font-semibold">
        Done
      </button>
    </Sheet>
  );
}
