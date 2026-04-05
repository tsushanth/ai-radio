'use client';

import { useLiveReactions, type FloatingReaction } from '@/hooks/useLiveReactions';

function FloatingEmoji({ reaction }: { reaction: FloatingReaction }) {
  return (
    <div
      className="absolute pointer-events-none select-none text-3xl animate-float-up"
      style={{ left: `${reaction.x}%`, bottom: '80px' }}
    >
      {reaction.emoji}
    </div>
  );
}

interface LiveReactionsProps {
  className?: string;
}

/**
 * Drop this inside any live-station view.
 * It renders a floating emoji overlay + a pill of reaction buttons.
 * The parent must have `position: relative` (or `relative` Tailwind class)
 * so floaters are contained within it.
 */
export function LiveReactions({ className }: LiveReactionsProps) {
  const { reactions, sendReaction, emojis } = useLiveReactions();

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Floating emoji layer — sits above content, ignores pointer events */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {reactions.map((r) => (
          <FloatingEmoji key={r.id} reaction={r} />
        ))}
      </div>

      {/* Emoji picker pill */}
      <div className="flex gap-3 justify-center px-5 py-3 bg-black/30 backdrop-blur-sm rounded-full">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="text-2xl leading-none transition-transform hover:scale-125 active:scale-110"
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
