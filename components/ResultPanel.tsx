'use client';

import { useState } from 'react';
import Image from 'next/image';

interface ResultPanelProps {
  originalImage: string | null;
  processedImage: string | null;
  fileName: string;
  isProcessing: boolean;
}

export default function ResultPanel({
  originalImage,
  processedImage,
  fileName,
  isProcessing,
}: ResultPanelProps) {
  const [view, setView] = useState<'split' | 'original' | 'processed'>('split');

  const handleDownload = () => {
    if (!processedImage) return;
    const link = document.createElement('a');
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    link.download = `${baseName}_no_watermark.png`;
    link.href = processedImage;
    link.click();
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex gap-1">
          {(['split', 'original', 'processed'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                view === v
                  ? 'bg-purple-600 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {processedImage && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        )}
      </div>

      {/* Image display */}
      <div className="p-4">
        {view === 'split' ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-white/40 text-xs text-center font-medium">Original</p>
              <div className="relative rounded-lg overflow-hidden bg-black/20 aspect-video flex items-center justify-center">
                {originalImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={originalImage}
                    alt="Original"
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-white/40 text-xs text-center font-medium">Processed</p>
              <div className="relative rounded-lg overflow-hidden bg-black/20 aspect-video flex items-center justify-center">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <svg className="animate-spin w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-white/40 text-xs">Processing...</span>
                  </div>
                ) : processedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={processedImage}
                    alt="Processed"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <p className="text-white/20 text-xs">Click &quot;Hide Watermark&quot;</p>
                    <p className="text-white/20 text-xs">to process</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden bg-black/20 flex items-center justify-center min-h-64">
              {view === 'original' && originalImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={originalImage}
                  alt="Original"
                  className="max-w-full max-h-[500px] object-contain"
                />
              )}
              {view === 'processed' && (
                isProcessing ? (
                  <div className="flex flex-col items-center gap-2 py-16">
                    <svg className="animate-spin w-10 h-10 text-purple-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-white/40 text-sm">Processing image...</span>
                  </div>
                ) : processedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={processedImage}
                    alt="Processed"
                    className="max-w-full max-h-[500px] object-contain"
                  />
                ) : (
                  <div className="py-16 text-center">
                    <p className="text-white/30 text-sm">No processed image yet</p>
                    <p className="text-white/20 text-xs mt-1">Use the controls to process your image</p>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      {processedImage && !isProcessing && (
        <div className="px-4 py-2 border-t border-white/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-white/50 text-xs">Watermark hidden successfully — ready to download</span>
        </div>
      )}
    </div>
  );
}
