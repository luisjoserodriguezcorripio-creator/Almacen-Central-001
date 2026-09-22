import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'dc_turnos_theme';

/** Modo oscuro persistente */
export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light') return false;
      if (saved === 'dark') return true;
    } catch {
      /* noop */
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  const toggle = useCallback(() => setDark((v) => !v), []);

  return { dark, toggle };
}
