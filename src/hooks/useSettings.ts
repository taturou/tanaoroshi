import { useState, useEffect } from 'react';

const SETTINGS_KEY = 'tanaoroshi_settings_client_id';
const USERNAME_KEY = 'tanaoroshi_settings_user_name';
const CATEGORIES_KEY = 'tanaoroshi_settings_categories';
const SERPAPI_KEY = 'tanaoroshi_settings_serpapi_key';

export function useSettings() {
  const [clientId, setClientId] = useState<string>(() => {
    return localStorage.getItem(SETTINGS_KEY) || '';
  });

  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem(USERNAME_KEY) || '';
  });

  const [serpApiKey, setSerpApiKey] = useState<string>(() => {
    return localStorage.getItem(SERPAPI_KEY) || '';
  });

  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem(CATEGORIES_KEY);
    return saved ? JSON.parse(saved) : ['飲料', '食品', '日用品']; // デフォルト値
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, clientId);
  }, [clientId]);

  useEffect(() => {
    localStorage.setItem(USERNAME_KEY, userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem(SERPAPI_KEY, serpApiKey);
  }, [serpApiKey]);

  useEffect(() => {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  }, [categories]);

  const addCategory = (category: string) => {
    const trimmed = category.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories(prev => [...prev, trimmed]);
    }
  };

  return { clientId, setClientId, userName, setUserName, serpApiKey, setSerpApiKey, categories, addCategory };
}
