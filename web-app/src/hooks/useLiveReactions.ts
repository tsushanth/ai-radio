import { useEffect, useCallback, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface FloatingReaction {
  id: string;
  emoji: string;
  /** Horizontal start position, 10–90 % from left */
  x: number;
}

export const REACTION_EMOJIS = ['🔥', '❤️', '😂', '🎵', '👏', '🤯'];

const CHANNEL = 'radio:live';
const RATE_LIMIT_MS = 333; // ~3 sends per second
const REACTION_TTL_MS = 3000;

export function useLiveReactions() {
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSendMs = useRef(0);

  useEffect(() => {
    const channel = supabase.channel(CHANNEL, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const emoji = payload?.emoji as string | undefined;
        if (!emoji) return;

        const item: FloatingReaction = {
          id: `${Date.now()}-${Math.random()}`,
          emoji,
          x: Math.random() * 80 + 10,
        };

        setReactions((prev) => [...prev, item]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== item.id));
        }, REACTION_TTL_MS);
      })
      .subscribe();

    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    const now = Date.now();
    if (now - lastSendMs.current < RATE_LIMIT_MS) return;
    lastSendMs.current = now;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { emoji },
    });
  }, []);

  return { reactions, sendReaction, emojis: REACTION_EMOJIS };
}
