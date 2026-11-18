import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSync } from '../sync';
import { useUI } from '../store';
import { APP_NAME } from '../config';
import { SIRI_EXAMPLES, SiriGuide } from './SiriGuide';

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Me → Settings: the Quick page (second Home Screen icon) and "Hey Siri" via Apple Shortcuts. */
export function ShortcutsCard() {
  const session = useSync((s) => s.session);
  const showToast = useUI((s) => s.showToast);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  const quickUrl = `${location.origin}${location.pathname}#quick`;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copied`, { tone: 'plan' });
    } catch {
      showToast("Couldn't copy — select and copy it instead", { tone: 'miss' });
    }
  };

  const makeKey = async () => {
    if (!supabase || !session) return;
    setBusy(true);
    const k = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const { error } = await supabase.from('profiles').update({ shortcut_key_hash: await sha256(k) }).eq('user_id', session.user.id);
    setBusy(false);
    if (error) return showToast("Couldn't create the key — try again", { tone: 'miss' });
    setKey(k);
  };

  return (
    <section className="card px-4 py-4">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">Quick access</h2>

      <div className="mt-3">
        <div className="text-[15px] font-semibold">⚡ Quick page</div>
        <p className="mt-0.5 text-[12.5px] text-muted">One screen to tick habits, add water and add a plan in 2 seconds. Save it as a second icon:</p>
        <ol className="mt-1.5 list-decimal pl-5 text-[12.5px] text-muted">
          <li>Copy the link and open it in Safari</li>
          <li>Share → Add to Home Screen → name it “{APP_NAME} Quick”</li>
        </ol>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <a href="#quick" className="grid min-h-11 place-items-center rounded-2xl bg-surface-2 text-[14px] font-semibold">
            Open it
          </a>
          <button onClick={() => void copy(quickUrl, 'Link')} className="min-h-11 rounded-2xl bg-surface-2 text-[14px] font-semibold">
            Copy link
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="text-[15px] font-semibold">🎙 Hey Siri, {APP_NAME}</div>
        <p className="mt-0.5 text-[12.5px] text-muted">Talk normally — Siri adds it to {APP_NAME} and reads back what it did:</p>
        <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
          {SIRI_EXAMPLES.slice(0, 4).map(([e, say, does]) => (
            <li key={say} className="flex gap-2">
              <span aria-hidden>{e}</span>
              <span className="text-text">“{say}”</span>
              <span className="ml-auto shrink-0 text-faint">{does}</span>
            </li>
          ))}
        </ul>
        {!session ? (
          <p className="mt-2 text-[12.5px] text-faint">Sign in to set up Siri.</p>
        ) : (
          <button onClick={() => setGuide(true)} className="mt-3 min-h-11 w-full rounded-2xl bg-plan text-[14px] font-semibold text-white">
            Set up Siri — step by step
          </button>
        )}
      </div>
      <SiriGuide open={guide} onClose={() => setGuide(false)} siriKey={key} onMakeKey={() => void makeKey()} busy={busy} />
    </section>
  );
}
