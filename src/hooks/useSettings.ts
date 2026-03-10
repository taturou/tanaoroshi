import { useState, useEffect } from 'react';

const SETTINGS_KEY = 'tanaoroshi_settings_client_id';

export function useSettings() {
  const [clientId, setClientId] = useState<string>(() => {
    return localStorage.getItem(SETTINGS_KEY) || '';
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, clientId);
  }, [clientId]);

  return { clientId, setClientId };
}
