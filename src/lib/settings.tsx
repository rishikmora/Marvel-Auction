'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { playCue, setSoundEnabled, type Cue } from './sound';

export interface AppSettings {
  sound: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
}

const DEFAULTS: AppSettings = { sound: false, reduceMotion: false, highContrast: false };
const STORAGE_KEY = 'marvel-auction:settings';

interface SettingsContextValue extends AppSettings {
  toggle: (key: keyof AppSettings) => void;
  set: (key: keyof AppSettings, value: boolean) => void;
  cue: (name: Cue) => void;
  ready: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  // Read persisted prefs after mount so server and first client render agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as Partial<AppSettings>) : {};
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setSettings({
        sound: stored.sound ?? DEFAULTS.sound,
        reduceMotion: stored.reduceMotion ?? prefersReduced,
        highContrast: stored.highContrast ?? DEFAULTS.highContrast,
      });
    } catch {
      setSettings(DEFAULTS);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private browsing — preferences simply do not persist.
    }
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
    document.documentElement.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    setSoundEnabled(settings.sound);
  }, [settings, ready]);

  const set = useCallback((key: keyof AppSettings, value: boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const toggle = useCallback((key: keyof AppSettings) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const cue = useCallback(
    (name: Cue) => {
      if (settings.sound) playCue(name);
    },
    [settings.sound],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ ...settings, toggle, set, cue, ready }),
    [settings, toggle, set, cue, ready],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
