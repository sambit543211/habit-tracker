import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { APP_NAME, SUPABASE_URL } from '../config';
import { useUI } from '../store';

const ENDPOINT = `${SUPABASE_URL}/functions/v1/quick-add`;

/** Things Siri understands — shown at the end and on the settings card. */
export const SIRI_EXAMPLES = [
  ['💧', 'Drank 1 litre of water', 'adds water'],
  ['✅', 'I meditated / went to the gym', 'ticks the habit'],
  ['🛌', 'Skip stretch today', 'skips it, streak safe'],
  ['📅', 'Gym tomorrow at 7 for 1 hour', 'adds a plan'],
  ['📝', 'Remind me to pay the gas bill', 'adds a plan for today'],
] as const;

/** A tiny drawing of the Shortcuts editor, with the part to touch highlighted. */
function Mock({ rows }: { rows: { icon: string; color: string; title: ReactNode; extra?: ReactNode; hi?: boolean }[] }) {
  return (
    <div className="mt-4 flex flex-col gap-1.5 rounded-3xl bg-black/60 p-3 ring-1 ring-line" aria-hidden>
      {rows.map((r, i) => (
        <div key={i} className={`rounded-2xl bg-[#2c2c2e] px-3 py-2.5 text-[13px] text-white ${r.hi ? 'ring-2 ring-plan' : 'opacity-60'}`}>
          <div className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-md text-[13px]" style={{ background: r.color }}>
              {r.icon}
            </span>
            <span className="min-w-0 flex-1">{r.title}</span>
          </div>
          {r.extra && <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2 text-[12px]">{r.extra}</div>}
        </div>
      ))}
    </div>
  );
}
const Blue = ({ children }: { children: ReactNode }) => <span className="rounded-md bg-sky-500/20 px-1.5 py-0.5 whitespace-nowrap text-sky-400">{children}</span>;
const Row = ({ k, v, hi }: { k: ReactNode; v: ReactNode; hi?: boolean }) => (
  <div className={`flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 ${hi ? 'bg-plan/25' : ''}`}>
    <span className="text-white/80">{k}</span>
    <span className="text-sky-400">{v}</span>
  </div>
);
const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-text">{children}</b>;

/** Full-screen, one step at a time, with Copy buttons for every value you need to type. */
export function SiriGuide({ open, onClose, siriKey, onMakeKey, busy }: { open: boolean; onClose: () => void; siriKey: string | null; onMakeKey: () => void; busy: boolean }) {
  const [i, setI] = useState(0);
  const showToast = useUI((s) => s.showToast);
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copied — now paste it in Shortcuts`, { tone: 'plan' });
    } catch {
      showToast("Couldn't copy — press and hold to select it", { tone: 'miss' });
    }
  };
  const CopyBtn = ({ text, what, label }: { text: string; what: string; label?: string }) => (
    <button onClick={() => void copy(text, what)} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left active:bg-surface-3">
      <code className="min-w-0 flex-1 truncate text-[13px] text-text">{label ?? text}</code>
      <span className="shrink-0 rounded-full bg-plan px-3 py-1.5 text-[13px] font-semibold text-white">Copy</span>
    </button>
  );

  const steps: { title: string; body: ReactNode }[] = [
    {
      title: 'Your private Siri key',
      body: siriKey ? (
        <>
          <p>This key lets Siri add things to <B>your</B> {APP_NAME}. Copy it now — you’ll paste it in step 6. It’s only shown while this guide is open.</p>
          <CopyBtn text={siriKey} what="Key" />
          <p className="mt-3 text-[12.5px] text-faint">Treat it like a password. Don’t share screenshots of it.</p>
        </>
      ) : (
        <>
          <p>First, make a private key so Siri can add things to your {APP_NAME} — and nobody else’s.</p>
          <button disabled={busy} onClick={onMakeKey} className="mt-4 min-h-12 w-full rounded-2xl bg-plan text-[15px] font-semibold text-white disabled:opacity-50">
            {busy ? 'Creating…' : 'Create my key'}
          </button>
          <p className="mt-3 text-[12.5px] text-faint">Making a new key turns off any old one.</p>
        </>
      ),
    },
    {
      title: 'Start a new shortcut',
      body: (
        <>
          <p>
            Open the <B>Shortcuts</B> app (it’s built into iPhone). Tap <B>+</B> at the top right. Then tap the name at the top → <B>Rename</B> → type <B>{APP_NAME}</B>.
          </p>
          <a href="shortcuts://" className="mt-4 grid min-h-12 place-items-center rounded-2xl bg-surface-2 text-[15px] font-semibold">
            Open Shortcuts ↗
          </a>
          <p className="mt-3 text-[12.5px] text-faint">The name is what you’ll say: “Hey Siri, {APP_NAME}”.</p>
        </>
      ),
    },
    {
      title: 'Add “Dictate Text”',
      body: (
        <>
          <p>
            Tap <B>Search Actions</B> at the bottom, type <B>Dictate Text</B> and tap it. This is where Siri listens to you.
          </p>
          <Mock rows={[{ icon: '🎙', color: '#5ac8fa', title: 'Dictate text', hi: true }]} />
        </>
      ),
    },
    {
      title: 'Add “Get Contents of URL”',
      body: (
        <>
          <p>
            Search <B>Get Contents of URL</B> and tap it. Shortcuts may put a blue <Blue>Dictated Text</Blue> bubble in the address — tap it, delete it, and paste this address instead:
          </p>
          <CopyBtn text={ENDPOINT} what="Address" label={ENDPOINT.replace('https://', '')} />
          <Mock
            rows={[
              { icon: '🎙', color: '#5ac8fa', title: 'Dictate text' },
              { icon: '⬇', color: '#34c759', title: <>Get contents of <Blue>https://…/quick-add</Blue></>, hi: true },
            ]}
          />
        </>
      ),
    },
    {
      title: 'Change the method to POST',
      body: (
        <>
          <p>
            Tap the small <B>›</B> arrow on that action to see more. Tap <B>GET</B> next to Method and choose <B>POST</B>.
          </p>
          <Mock rows={[{ icon: '⬇', color: '#34c759', title: <>Get contents of <Blue>…/quick-add</Blue></>, hi: true, extra: <Row k="Method" v="POST" hi /> }]} />
        </>
      ),
    },
    {
      title: 'Add your key as a header',
      body: (
        <>
          <p>
            Under <B>Headers</B> tap <B>Add new header</B>. Copy and paste these two:
          </p>
          <p className="mt-3 text-[12.5px] font-semibold tracking-wide text-muted uppercase">Key</p>
          <CopyBtn text="x-sky-key" what="Header name" />
          <p className="mt-3 text-[12.5px] font-semibold tracking-wide text-muted uppercase">Text</p>
          {siriKey ? <CopyBtn text={siriKey} what="Key" label={`${siriKey.slice(0, 6)}••••••••`} /> : <p className="mt-1 text-[13px] text-miss">Go back to step 1 to create your key.</p>}
          <Mock
            rows={[
              {
                icon: '⬇',
                color: '#34c759',
                title: 'Get contents of URL',
                hi: true,
                extra: (
                  <>
                    <Row k="Method" v="POST" />
                    <Row k="x-sky-key" v="c8GG…" hi />
                  </>
                ),
              },
            ]}
          />
        </>
      ),
    },
    {
      title: 'Send what you said',
      body: (
        <>
          <p>
            <B>Request Body</B> should say <B>JSON</B>. Tap <B>Add new field</B> → <B>Text</B>.
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>
              Key: <B>text</B>
            </li>
            <li>
              Text: tap the box, then tap the blue <Blue>🎙 Dictated Text</Blue> bubble above the keyboard. Don’t type it — it must be the blue bubble.
            </li>
          </ul>
          <CopyBtn text="text" what="Field name" />
          <Mock
            rows={[
              {
                icon: '⬇',
                color: '#34c759',
                title: 'Get contents of URL',
                hi: true,
                extra: (
                  <>
                    <Row k="Request Body" v="JSON" />
                    <Row k="text" v={<Blue>🎙 Dictated Text</Blue>} hi />
                  </>
                ),
              },
            ]}
          />
        </>
      ),
    },
    {
      title: 'Let Siri answer you',
      body: (
        <>
          <p>
            Search <B>Speak Text</B> and add it. It should say “Speak <Blue>Contents of URL</Blue>”. If it shows something else, tap it and pick Contents of URL.
          </p>
          <Mock
            rows={[
              { icon: '🎙', color: '#5ac8fa', title: 'Dictate text' },
              { icon: '⬇', color: '#34c759', title: 'Get contents of URL' },
              { icon: '💬', color: '#000', title: <>Speak <Blue>Contents of URL</Blue></>, hi: true },
            ]}
          />
          <p className="mt-3">Tap <B>Done</B>.</p>
        </>
      ),
    },
    {
      title: 'Try it 🎉',
      body: (
        <>
          <p>
            Say <B>“Hey Siri, {APP_NAME}”</B>. When it listens, talk normally — any of these work:
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {SIRI_EXAMPLES.map(([e, say, does]) => (
              <li key={say} className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-3 py-2.5">
                <span aria-hidden>{e}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-text">“{say}”</span>
                  <span className="text-[12px] text-faint">{does}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-faint">
            If Siri says the key isn’t valid, make a new key in step 1 and paste it again in step 6. Tip: in Shortcuts, you can long-press {APP_NAME} → Add to Home Screen for a one-tap mic.
          </p>
        </>
      ),
    },
  ];
  const last = i === steps.length - 1;
  const step = steps[i];

  // Portal: a fixed overlay inside an animated screen would scroll with it.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col bg-bg"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          role="dialog"
          aria-modal
          aria-label={`Set up Hey Siri, ${APP_NAME}`}
        >
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden px-5 pt-[max(env(safe-area-inset-top),16px)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-wide text-muted uppercase">
                Siri setup · {i + 1} of {steps.length}
              </span>
              <button onClick={onClose} className="grid size-11 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-2 flex gap-1" aria-hidden>
              {steps.map((_, n) => (
                <span key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= i ? 'bg-plan' : 'bg-surface-3'}`} />
              ))}
            </div>
            <div className="mt-5 flex-1 overflow-y-auto pb-6 no-scrollbar">
              <AnimatePresence mode="wait">
                <motion.div key={i} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                  <h2 className="text-[24px] leading-tight font-bold">{step.title}</h2>
                  <div className="mt-3 text-[15px] leading-relaxed text-muted">{step.body}</div>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-2 pt-2 pb-[max(env(safe-area-inset-bottom),16px)]">
              <button disabled={i === 0} onClick={() => setI(i - 1)} className="min-h-12 rounded-2xl bg-surface-2 px-5 text-[15px] font-semibold disabled:opacity-30">
                Back
              </button>
              <button
                disabled={i === 0 && !siriKey}
                onClick={() => (last ? (onClose(), setI(0)) : setI(i + 1))}
                className="min-h-12 rounded-2xl bg-plan text-[15px] font-semibold text-white disabled:opacity-40"
              >
                {last ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
