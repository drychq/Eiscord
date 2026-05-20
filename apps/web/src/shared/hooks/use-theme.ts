import { useEffect } from 'react';
import { useThemeStore, type ThemePreference } from '../state/use-theme-store';

type ResolvedTheme = 'dark' | 'light';

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return preference;
}

function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

/** Synchronizes store preference, system media query, and DOM `data-theme` attribute. */
export function useTheme(): void {
  const preference = useThemeStore((state) => state.preference);

  useEffect(() => {
    applyTheme(resolveTheme(preference));
    if (preference !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme(resolveTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);
}
