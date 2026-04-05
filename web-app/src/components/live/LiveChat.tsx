'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Send } from 'lucide-react';

interface ChatMessage {
  id: string;
  text: string;
  username: string;
  isTopicRequest: boolean;
  timestamp: number;
}

const CHANNEL = 'radio:live';
const MAX_MESSAGES = 5;

interface LiveChatProps {
  username: string;
  className?: string;
}

export function LiveChat({ username, className }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase.channel(`${CHANNEL}-chat`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const msg: ChatMessage = {
          id: `${Date.now()}-${Math.random()}`,
          text: payload?.text || '',
          username: payload?.username || 'Anonymous',
          isTopicRequest: (payload?.text || '').toLowerCase().includes('@audexa'),
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !channelRef.current) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'chat',
      payload: { text, username },
    });
    setInput('');
  }, [input, username]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1 max-h-32 mb-2 px-1">
        {messages.length === 0 && (
          <p className="text-xs text-white/40 text-center py-2">
            Say something or type @audexa + topic to request
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="text-xs">
            <span className={`font-bold ${msg.isTopicRequest ? 'text-yellow-300' : 'text-white/80'}`}>
              {msg.username}:
            </span>{' '}
            <span className={msg.isTopicRequest ? 'text-yellow-200' : 'text-white/70'}>
              {msg.text}
            </span>
            {msg.isTopicRequest && (
              <span className="ml-1 text-[10px] bg-yellow-500/30 text-yellow-200 px-1 rounded">
                TOPIC REQUEST
              </span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Chat or @audexa request a topic..."
          className="flex-1 bg-white/10 text-white text-xs placeholder-white/40 rounded-full px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/30"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="p-2 bg-white/20 rounded-full hover:bg-white/30 disabled:opacity-30 transition-colors"
        >
          <Send className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}
