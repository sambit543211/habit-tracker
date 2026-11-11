import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import './index.css';
import { initSync } from './sync';
import { useStore } from './store';

initSync();

// Appearance: follow the phone, or force light/dark (Profile → Appearance).
const applyTheme = (t: 'system' | 'light' | 'dark') => {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = t;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const forDark = (m.media || '').includes('dark');
    const dark = t === 'system' ? forDark : t === 'dark';
    m.content = dark ? '#0A0A0C' : '#F6F5F2';
  });
};
applyTheme(useStore.getState().theme ?? 'system');
useStore.subscribe((s, p) => {
  if (s.theme !== p.theme) applyTheme(s.theme);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// Offline support + "Add to Home Screen" (production only).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
