'use client';

import { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';

interface DeepDiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (query: string, options: { language: string; durationMinutes: number }) => Promise<void>;
  isGenerating: boolean;
}

const SUGGESTED_TOPICS = [
  "The history and future of artificial intelligence",
  "How climate change affects global food supply",
  "The science behind sleep and dreaming",
  "Cryptocurrency and the future of money",
  "Space exploration: What's next after Mars?",
];

export function DeepDiveModal({ isOpen, onClose, onGenerate, isGenerating }: DeepDiveModalProps) {
  const [query, setQuery] = useState('');
  const [duration, setDuration] = useState(10);
  const [language, setLanguage] = useState('en');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isGenerating) return;
    await onGenerate(query.trim(), { language, durationMinutes: duration });
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-bold">Deep Dive</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What do you want to learn about?
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter any topic you want to explore in depth..."
              rows={3}
              disabled={isGenerating}
              className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:bg-gray-100"
            />
          </div>

          {/* Suggestions */}
          {!query && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => handleSuggestionClick(topic)}
                    className="px-3 py-1.5 bg-purple-50 text-purple-700 text-xs rounded-full hover:bg-purple-100 transition-colors"
                  >
                    {topic.length > 40 ? topic.slice(0, 40) + '...' : topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                disabled={isGenerating}
                className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
              >
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isGenerating}
                className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="submit"
            disabled={!query.trim() || isGenerating}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Deep Dive...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Deep Dive
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 text-center">
            AI will research your topic and create a podcast-style audio summary
          </p>
        </form>
      </div>
    </div>
  );
}
