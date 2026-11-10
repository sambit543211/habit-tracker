import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Ring } from '../components/Ring';
import { ChevronLeftIcon } from '../components/icons';

/** Passwordless sign-in with a 6-digit email code (works inside home-screen apps). */
export function Login() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Enter a valid email address.');
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    setEmail(e);
    setStep('code');
    setCooldown(60);
    setTimeout(() => codeRef.current?.focus(), 350);
  };

  const verify = async (token = code) => {
    if (token.length < 6) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (error) {
      setCode('');
      setError(friendly(error.message));
    }
    // On success the auth listener takes over.
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(env(safe-area-inset-top),32px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="mt-6 flex justify-center">
        <div className="relative">
          <Ring value={0.78} color="var(--habit)" size={96} stroke={9} />
          <div className="absolute inset-[15px]">
            <Ring value={0.62} color="var(--plan)" size={66} stroke={9} />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 'email' ? (
          <motion.form
            key="email"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
            className="flex flex-1 flex-col"
          >
            <h1 className="mt-8 text-[30px] leading-[1.1] font-bold tracking-[-0.03em]">Sign in to Keep</h1>
            <p className="mt-2 text-[15px] text-muted">
              Your habits and plans sync across every device. We'll email you a 6-digit code — no password needed.
            </p>
            <label className="mt-8 text-[13px] font-medium text-muted" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-4 py-4 outline-none placeholder:text-faint focus:border-line-strong"
            />
            <ErrorText error={error} />
            <div className="flex-1" />
            <Primary busy={busy} disabled={!email.trim()}>
              Email me a code
            </Primary>
            <button
              type="button"
              onClick={() => {
                const e = email.trim().toLowerCase();
                if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Enter your email first.');
                setEmail(e);
                setError(null);
                setStep('code');
                setTimeout(() => codeRef.current?.focus(), 350);
              }}
              className="mt-3 w-full py-2 text-[14px] font-medium text-muted"
            >
              Already have a code?
            </button>
          </motion.form>
        ) : (
          <motion.div
            key="code"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex flex-1 flex-col"
          >
            <button
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
              className="mt-6 -ml-2 flex items-center gap-1 self-start rounded-full px-2 py-1 text-[14px] text-muted"
            >
              <ChevronLeftIcon size={18} /> Change email
            </button>
            <h1 className="mt-3 text-[30px] leading-[1.1] font-bold tracking-[-0.03em]">Check your email</h1>
            <p className="mt-2 text-[15px] text-muted">
              Enter the code we sent to <span className="font-medium text-text">{email}</span>.
            </p>
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                setCode(v);
                if (v.length === 6 || v.length === 8) void verify(v);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              aria-label="Verification code"
              className="tabular mt-8 w-full rounded-2xl border border-line bg-surface px-4 py-4 text-center text-[28px] font-semibold tracking-[0.4em] outline-none placeholder:text-faint focus:border-line-strong"
            />
            <ErrorText error={error} />
            <button
              disabled={cooldown > 0 || busy}
              onClick={() => void sendCode()}
              className="mt-4 self-center text-[14px] font-medium text-plan disabled:text-faint"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
            <p className="mt-2 text-center text-[12.5px] text-faint">Can't find it? Check spam or promotions.</p>
            <div className="flex-1" />
            <Primary busy={busy} disabled={code.length < 6} onClick={() => void verify()}>
              Verify
            </Primary>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return (
    <AnimatePresence>
      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-[14px] text-miss">
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function Primary({ busy, disabled, onClick, children }: { busy: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      disabled={disabled || busy}
      className="mt-6 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg disabled:opacity-30"
    >
      {busy ? 'Please wait…' : children}
    </motion.button>
  );
}

function friendly(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes('expired') || m.includes('invalid')) return 'That code is wrong or expired. Try again or resend.';
  if (m.includes('rate') || m.includes('security purposes') || m.includes('too many'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('fetch') || m.includes('network')) return "You're offline. Connect to the internet to sign in.";
  return msg;
}
