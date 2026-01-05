'use client';

import { Script } from '@/types';
import { X, User, Mic } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ScriptViewerProps {
  isOpen: boolean;
  onClose: () => void;
  script: Script | null;
  title?: string;
}

export function ScriptViewer({ isOpen, onClose, script, title }: ScriptViewerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title || 'Podcast Script'}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {script?.segments && script.segments.length > 0 ? (
            script.segments.map((segment, index) => (
              <div
                key={index}
                className={cn(
                  'flex gap-3',
                  segment.speaker === 'host2' ? 'flex-row-reverse' : ''
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    segment.speaker === 'host1'
                      ? 'bg-orange-100 text-orange-600'
                      : 'bg-blue-100 text-blue-600'
                  )}
                >
                  {segment.speaker === 'host1' ? (
                    <Mic className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>

                {/* Speech bubble */}
                <div
                  className={cn(
                    'flex-1 p-3 rounded-2xl max-w-[80%]',
                    segment.speaker === 'host1'
                      ? 'bg-orange-50 rounded-tl-none'
                      : 'bg-blue-50 rounded-tr-none'
                  )}
                >
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {segment.speaker === 'host1' ? 'Host 1' : 'Host 2'}
                    {segment.type && (
                      <span className="ml-2 px-2 py-0.5 bg-white rounded text-xs">
                        {segment.type}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {segment.text}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Mic className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No script available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {script && (
          <div className="p-4 border-t bg-gray-50 rounded-b-2xl">
            <p className="text-sm text-gray-500 text-center">
              {script.totalSegments} segments
              {script.estimatedDurationSeconds && (
                <> • ~{Math.round(script.estimatedDurationSeconds / 60)} min</>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
