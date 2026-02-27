import { useState, useCallback } from 'react';
import type { AppSettings } from '@/types';

const KEY = 'lexis_settings';

const DEFAULTS: AppSettings = {
  deepseekApiKey: '',
  defaultDensity: 20,
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(load);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev: AppSettings) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
