'use client';

import { useCallback, useState } from 'react';

interface UploadZoneProps {
  onUpload: (file: File) => void;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      onUpload(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200
        ${isDragging
          ? 'border-purple-400 bg-purple-500/10 scale-[1.01]'
          : 'border-white/20 bg-white/5 hover:border-purple-400/60 hover:bg-white/8'
        }
      `}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      <div className="flex flex-col items-center gap-4">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${isDragging ? 'bg-purple-500/30' : 'bg-white/10'}`}>
          <svg className="w-8 h-8 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

        <div>
          <p className="text-white text-lg font-medium mb-1">
            {isDragging ? 'Drop your image here' : 'Drop image or click to upload'}
          </p>
          <p className="text-white/40 text-sm">
            Supports PNG, JPG, WEBP — Gemini-generated images work best
          </p>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <div className="h-px w-16 bg-white/10" />
          <span className="text-white/30 text-xs">or</span>
          <div className="h-px w-16 bg-white/10" />
        </div>

        <button
          type="button"
          className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-sm transition-colors pointer-events-none"
        >
          Browse Files
        </button>
      </div>
    </div>
  );
}
