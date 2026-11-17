import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSync } from '../sync';
import { useUI } from '../store';
import { APP_NAME, SUPABASE_URL } from '../config';

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Me → Settings: the Quick page (second Home Screen icon) and "Hey Siri" via Apple Shortcuts. */
export function ShortcutsCard() {
  const session = useSync((s) => s.session);
  const showToast = useUI((s) => s.showToast);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `${SUPABASE_URL}/functions/v1/quick-add`;
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
        <p className="mt-0.5 text-[12.5px] text-muted">
          Say “Gym tomorrow 7pm 1h”, “done reading” or “drank 500 ml” — Siri adds it and reads back what it did.
        </p>
        {!session ? (
          <p className="mt-2 text-[12.5px] text-faint">Sign in to set up Siri.</p>
        ) : !key ? (
          <button disabled={busy} onClick={() => void makeKey()} className="mt-2 min-h-11 w-full rounded-2xl bg-plan text-[14px] font-semibold text-white disabled:opacity-50">
            {busy ? 'Creating…' : 'Set up Siri'}
          </button>
        ) : (
          <div className="mt-2 rounded-2xl bg-surface-2 px-3 py-3 text-[12.5px] leading-relaxed">
            <div className="font-semibold text-text">Your key (shown once — keep it private):</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-bg px-2 py-1.5 text-[12px]">{key}</code>
              <button onClick={() => void copy(key, 'Key')} className="shrink-0 rounded-lg bg-plan px-3 py-1.5 font-semibold text-white">
                Copy
              </button>
            </div>
            <ol className="mt-3 list-decimal pl-5 text-muted">
              <li>
                Open the <b className="text-text">Shortcuts</b> app → <b className="text-text">+</b> → name it “{APP_NAME}”.
              </li>
              <li>
                Add <b className="text-text">Dictate Text</b>.
              </li>
              <li>
                Add <b className="text-text">Get Contents of URL</b>: URL{' '}
                <button onClick={() => void copy(endpoint, 'Address')} className="font-semibold text-plan underline">
                  copy address
                </button>
                , Method <b className="text-text">POST</b>, Header <b className="text-text">x-sky-key</b> = your key, Request Body{' '}
                <b className="text-text">JSON</b> with <b className="text-text">text</b> = Dictated Text.
              </li>
              <li>
                Add <b className="text-text">Speak Text</b> (Contents of URL).
              </li>
              <li>Say “Hey Siri, {APP_NAME}”.</li>
            </ol>
            <button onClick={() => void makeKey()} className="mt-2 text-[12px] font-medium text-faint underline">
              Lost it? Make a new key (the old one stops working)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
