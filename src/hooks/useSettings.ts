import { useState, useEffect } from 'react';

const SETTINGS_KEY = 'tanaoroshi_settings_client_id';
const USERNAME_KEY = 'tanaoroshi_settings_user_name';

export function useSettings() {
  const [clientId, setClientId] = useState<string>(() => {
    return localStorage.getItem(SETTINGS_KEY) || '';
  });

  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem(USERNAME_KEY) || '';
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, clientId);
  }, [clientId]);

  useEffect(() => {
    localStorage.setItem(USERNAME_KEY, userName);
  }, [userName]);

  return { clientId, setClientId, userName, setUserName };
}
