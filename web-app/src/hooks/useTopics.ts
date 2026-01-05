'use client';

import { useState, useEffect } from 'react';
import { Topic } from '@/types';
import { getTopics } from '@/lib/api/episodes';

export function useTopics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTopics() {
      try {
        setIsLoading(true);
        console.log('[useTopics] Fetching topics...');
        const data = await getTopics();
        console.log('[useTopics] Response:', JSON.stringify(data, null, 2));
        console.log('[useTopics] Topics count:', data.topics?.length || 0);
        console.log('[useTopics] Categories:', data.categories);
        setTopics(data.topics || []);
        setCategories(data.categories || []);
        setError(null);
      } catch (err) {
        console.error('[useTopics] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load topics');
      } finally {
        setIsLoading(false);
      }
    }

    fetchTopics();
  }, []);

  return { topics, categories, isLoading, error };
}
