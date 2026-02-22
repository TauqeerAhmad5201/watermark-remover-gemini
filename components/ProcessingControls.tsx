'use client';

interface Settings {
  blurRadius: number;
  coverColor: string;
  method: 'blur' | 'fill' | 'inpaint' | 'remove';
  opacity: number;
}

interface ProcessingControlsProps {
  settings: Settings;
  onChange: (s: Settings) => void;
  onProcess: () => void;
  isProcessing: boolean;
  hasImage: boolean;
}

export default function ProcessingControls({
  settings,
  onChange,
  onProcess,
  isProcessing,
  hasImage,
}: ProcessingControlsProps) {
  const update = (key: keyof Settings, value: Settings[keyof Settings]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-5">
      <h2 className="text-white font-semibold text-sm uppercase tracking-wider">
        Processing Options
      </h2>

      {/* Method */}
      <div className="space-y-2">
        <label className="text-white/60 text-xs font-medium">Hiding Method</label>
        <div className="grid grid-cols-2 gap-2">
          {(['remove', 'blur', 'fill', 'inpaint'] as const).map((m) => (
            <button
              key={m}
              onClick={() => update('method', m)}
              className={`py-2 px-3 rounded-lg text-xs font-medium capitalize transition-all ${
                settings.method === m
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
              }`}
            >
              {m === 'inpaint' ? 'Smart Fill' : m === 'remove' ? '✨ Remove' : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-white/30 text-xs">
          {settings.method === 'remove' && 'Mathematically reverses the watermark blending (best quality)'}
          {settings.method === 'blur' && 'Applies Gaussian blur over the watermark area'}
          {settings.method === 'fill' && 'Fills the watermark area with a solid color'}
          {settings.method === 'inpaint' && 'Samples surrounding pixels to blend the area'}
        </p>
      </div>

      {/* Blur radius (only for blur) */}
      {settings.method === 'blur' && (
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-white/60 text-xs font-medium">Blur Intensity</label>
            <span className="text-purple-400 text-xs font-mono">{settings.blurRadius}px</span>
          </div>
          <input
            type="range"
            min={5}
            max={50}
            value={settings.blurRadius}
            onChange={(e) => update('blurRadius', Number(e.target.value))}
            className="w-full accent-purple-500"
          />
        </div>
      )}

      {/* Fill color (only for fill) */}
      {settings.method === 'fill' && (
        <div className="space-y-2">
          <label className="text-white/60 text-xs font-medium">Fill Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.coverColor}
              onChange={(e) => update('coverColor', e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
            />
            <div className="flex gap-2">
              {['#ffffff', '#000000', '#f0f0f0', '#1a1a2e'].map((c) => (
                <button
                  key={c}
                  onClick={() => update('coverColor', c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-md border-2 transition-all ${
                    settings.coverColor === c ? 'border-purple-400 scale-110' : 'border-white/20'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Opacity */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="text-white/60 text-xs font-medium">Effect Strength</label>
          <span className="text-purple-400 text-xs font-mono">{Math.round(settings.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={settings.opacity}
          onChange={(e) => update('opacity', Number(e.target.value))}
          className="w-full accent-purple-500"
        />
      </div>

      {/* Process button */}
      <button
        onClick={onProcess}
        disabled={!hasImage || isProcessing}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
          !hasImage || isProcessing
            ? 'bg-white/10 text-white/30 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40'
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Processing...
          </span>
        ) : (
          '✨ Hide Watermark'
        )}
      </button>
    </div>
  );
}
