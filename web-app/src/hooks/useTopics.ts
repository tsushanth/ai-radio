'use client';

import { useState, useEffect } from 'react';
import { Topic } from '@/types';
import { getTopics } from '@/lib/api/episodes';
import { useAuth } from '@/components/auth/AuthProvider';

export function useTopics() {
  const { preferences } = useAuth();
  const language = preferences.language;
  const [topics, setTopics] = useState<Topic[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reloads when the user changes language: the backend returns localized names and the locale's own topics for ?lang=
  useEffect(() => {
    let cancelled = false;
    async function fetchTopics() {
      try {
        setIsLoading(true);
        const data = await getTopics(language);
        if (cancelled) return;
        setTopics(data.topics || []);
        setCategories(data.categories || []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('[useTopics] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load topics');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchTopics();
    return () => {
      cancelled = true;
    };
  }, [language]);

  return { topics, categories, isLoading, error };
}
