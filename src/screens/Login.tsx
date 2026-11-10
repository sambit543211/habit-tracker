import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Ring } from '../components/Ring';
import { ChevronLeftIcon } from '../components/icons';

type Mode = 'signin' | 'signup' | 'code-email' | 'code-verify';

const validEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e);

/**
 * Email + password sign-in (no emails needed — works inside the iPhone
 * Home Screen app). An email-code option is kept for later, once a
 * dedicated email service is connected.
 */
export function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const cleanEmail = () => {
    const e = email.trim().toLowerCase();
    if (!validEmail(e)) {
      setError('Enter a valid email address.');
      return null;
    }
    setEmail(e);
    return e;
  };

  const submitPassword = async () => {
    const e = cleanEmail();
    if (!e) return;
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    setError(null);
    setInfo(null);
    if (mode === 'signup') {
      const { data, error } = await supabase!.auth.signUp({ email: e, password });
      setBusy(false);
      if (error) return setError(friendly(error.message));
      if (!data.session) {
        // Email confirmation is still switched on in Supabase, or the account exists.
        setInfo(
          data.user?.identities?.length === 0
            ? 'An account with this email already exists. Sign in instead.'
            : 'Account created, but Supabase is asking for email confirmation. Turn off "Confirm email" in Supabase → Authentication → Sign In / Providers → Email, then sign in.',
        );
        setMode('signin');
      }
      return; // with a session, the auth listener takes over
    }
    const { error } = await supabase!.auth.signInWithPassword({ email: e, password });
    setBusy(false);
    if (error) setError(friendly(error.message));
  };

  const sendCode = async () => {
    const e = cleanEmail();
    if (!e) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    setMode('code-verify');
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
  };

  const field =
    'mt-1.5 w-full rounded-2xl border border-line bg-surface px-4 py-4 outline-none placeholder:text-faint focus:border-line-strong';
  const passwordMode = mode === 'signin' || mode === 'signup';

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(env(safe-area-inset-top),32px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="mt-4 flex justify-center">
        <div className="relative">
          <Ring value={0.78} color="var(--habit)" size={88} stroke={9} />
          <div className="absolute inset-[15px]">
            <Ring value={0.62} color="var(--plan)" size={58} stroke={9} />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {passwordMode && (
          <motion.form
            key="password"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            onSubmit={(e) => {
              e.preventDefault();
              void submitPassword();
            }}
            className="flex flex-1 flex-col"
          >
            <h1 className="mt-7 text-[30px] leading-[1.1] font-bold tracking-[-0.03em]">
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="mt-2 text-[15px] text-muted">Your habits and plans sync across every device.</p>

            <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => go(m)}
                  className={`relative rounded-xl py-2.5 text-[14px] font-medium ${mode === m ? 'text-text' : 'text-muted'}`}
                >
                  {mode === m && <motion.span layoutId="auth-pill" className="absolute inset-0 rounded-xl bg-surface shadow-sm" />}
                  <span className="relative">{m === 'signin' ? 'Sign in' : 'Create account'}</span>
                </button>
              ))}
            </div>

            <label className="mt-5 text-[13px] font-medium text-muted" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete={mode === 'signup' ? 'email' : 'username'}
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
            />

            <label className="mt-4 text-[13px] font-medium text-muted" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPw ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                className={`${field} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute top-1/2 right-3 mt-[3px] -translate-y-1/2 rounded-lg px-2 py-1 text-[13px] font-medium text-muted"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'signup' && (
              <p className="mt-2 text-[12.5px] text-faint">Let iPhone suggest a strong password — it's saved to your Keychain automatically.</p>
            )}

            <Notice error={error} info={info} />
            <div className="flex-1" />
            <Primary busy={busy} disabled={!email.trim() || !password}>
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </Primary>
            <button type="button" onClick={() => go('code-email')} className="mt-3 w-full py-2 text-[14px] font-medium text-muted">
              Use an email code instead
            </button>
          </motion.form>
        )}

        {mode === 'code-email' && (
          <motion.form
            key="code-email"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
            className="flex flex-1 flex-col"
          >
            <Back onClick={() => go('signin')} label="Use a password" />
            <h1 className="mt-3 text-[30px] leading-[1.1] font-bold tracking-[-0.03em]">Sign in with a code</h1>
            <p className="mt-2 text-[15px] text-muted">We'll email you a 6-digit code.</p>
            <label className="mt-6 text-[13px] font-medium text-muted" htmlFor="code-email">
              Email
            </label>
            <input
              id="code-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
            />
            <Notice error={error} info={info} />
            <div className="flex-1" />
            <Primary busy={busy} disabled={!email.trim()}>
              Email me a code
            </Primary>
            <button
              type="button"
              onClick={() => {
                if (cleanEmail()) {
                  go('code-verify');
                  setTimeout(() => codeRef.current?.focus(), 350);
                }
              }}
              className="mt-3 w-full py-2 text-[14px] font-medium text-muted"
            >
              Already have a code?
            </button>
          </motion.form>
        )}

        {mode === 'code-verify' && (
          <motion.div
            key="code-verify"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex flex-1 flex-col"
          >
            <Back
              onClick={() => {
                setCode('');
                go('code-email');
              }}
              label="Change email"
            />
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
            <Notice error={error} info={info} />
            <button
              disabled={cooldown > 0 || busy}
              onClick={() => void sendCode()}
              className="mt-4 self-center text-[14px] font-medium text-plan disabled:text-faint"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
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

function Back({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 -ml-2 flex items-center gap-1 self-start rounded-full px-2 py-1 text-[14px] text-muted"
    >
      <ChevronLeftIcon size={18} /> {label}
    </button>
  );
}

function Notice({ error, info }: { error: string | null; info: string | null }) {
  return (
    <AnimatePresence>
      {(error || info) && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`mt-3 text-[14px] leading-relaxed ${error ? 'text-miss' : 'text-gold'}`}
        >
          {error ?? info}
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
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('email not confirmed'))
    return 'This account still needs email confirmation. Turn off "Confirm email" in Supabase, or create the account again.';
  if (m.includes('already registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('expired') || m.includes('invalid')) return 'That code is wrong or expired. Try again or resend.';
  if (m.includes('rate') || m.includes('security purposes') || m.includes('too many'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('weak') || m.includes('password should')) return 'Pick a stronger password (at least 8 characters).';
  if (m.includes('fetch') || m.includes('network')) return "You're offline. Connect to the internet to sign in.";
  return msg;
}
