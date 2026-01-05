'use client';

import { useState, useEffect, useCallback } from 'react';
import { Episode } from '@/types';
import { getEpisodes, deleteEpisode as deleteEpisodeApi } from '@/lib/api/episodes';

export function useEpisodes(userId: string | null) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEpisodes = useCallback(async () => {
    if (!userId) {
      setEpisodes([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const data = await getEpisodes(userId);
      setEpisodes(data.episodes || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load episodes');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchEpisodes();
  }, [fetchEpisodes]);

  const deleteEpisode = async (episodeId: string) => {
    try {
      await deleteEpisodeApi(episodeId);
      setEpisodes((prev) => prev.filter((e) => e.id !== episodeId));
    } catch (err) {
      throw err;
    }
  };

  return {
    episodes,
    isLoading,
    error,
    refetch: fetchEpisodes,
    deleteEpisode,
  };
}
