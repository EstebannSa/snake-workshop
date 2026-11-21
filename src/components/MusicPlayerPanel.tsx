import React, { useEffect, useRef, useState } from 'react';
import {
  Music,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { synthEngine } from '../audio/synthEngine';
import { Track } from '../types/app';

interface MusicPlayerPanelProps {
  track: Track;
  isPlaying: boolean;
  isLooping: boolean;
  volume: number;
  isMuted: boolean;
  isSfxMuted: boolean;
  elapsedSeconds: number;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onToggleLoop: () => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleSfxMute: () => void;
  onSeek: (seconds: number) => void;
}

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MusicPlayerPanel: React.FC<MusicPlayerPanelProps> = ({
  track,
  isPlaying,
  isLooping,
  volume,
  isMuted,
  isSfxMuted,
  elapsedSeconds,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  onToggleLoop,
  onVolumeChange,
  onToggleMute,
  onToggleSfxMute,
  onSeek,
}) => {
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const freqBufferRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [track.id]);

  // Stepped Blocky Glitch FFT Spectrum Canvas
  useEffect(() => {
    let rafId = 0;

    const drawSpectrum = () => {
      const canvas = visualizerRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx && rect.width > 0 && rect.height > 0) {
          ctx.save();
          ctx.scale(dpr, dpr);

          const w = rect.width;
          const h = rect.height;
          ctx.clearRect(0, 0, w, h);

          const active = isPlaying && synthEngine.getFrequencyData(freqBufferRef.current);
          const barCount = 24;
          const gap = 3;
          const barW = Math.floor((w - gap * (barCount - 1)) / barCount);

          for (let i = 0; i < barCount; i++) {
            const rawVal = active ? freqBufferRef.current[i] / 255 : 0.08;
            // Quantize height to 4px pixel steps for retro CRT feel
            const rawH = Math.max(4, rawVal * (h - 4));
            const barH = Math.max(4, Math.floor(rawH / 4) * 4);
            const x = i * (barW + gap);
            const y = h - barH;

            if (active) {
              ctx.fillStyle = i % 2 === 0 ? '#00FFFF' : '#FF00FF';
            } else {
              ctx.fillStyle = 'rgba(0, 255, 255, 0.22)';
            }
            ctx.fillRect(x, y, barW, barH);
          }

          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(drawSpectrum);
    };

    rafId = window.requestAnimationFrame(drawSpectrum);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const progressPct =
    track.durationSeconds > 0
      ? Math.min(100, (elapsedSeconds / track.durationSeconds) * 100)
      : 0;

  return (
    <aside
      aria-label="Audio Daemon Controls"
      className="flex flex-col bg-[#05020A] glitch-frame p-4 sm:p-5 h-full"
    >
      <div className="flex items-baseline justify-between gap-2 pb-3 border-b-2 border-[#00FFFF]/40">
        <h2
          data-text="AUDIO_DAEMON"
          className="font-display text-xs tracking-wide text-[#FF00FF] glitch-text"
        >
          AUDIO_DAEMON
        </h2>
        <span className="font-mono text-xs tabular-nums text-[#00FFFF]">
          {track.bpm}_BPM
        </span>
      </div>

      {/* Square Glitch Artwork Frame */}
      <div className="mt-4 relative w-full aspect-square max-w-[248px] mx-auto bg-black border-2 border-[#FF00FF] shadow-[4px_4px_0_0_#00FFFF] flex items-center justify-center overflow-hidden">
        {!imgError ? (
          <img
            src={track.coverImage}
            alt={`${track.title} artwork`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover contrast-125 saturate-150"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-[#00FFFF]">
            <Music className="w-10 h-10" />
            <span className="text-xs font-bold">{track.title}</span>
          </div>
        )}
      </div>

      {/* Track Title & Cryptic Metadata */}
      <div className="mt-4">
        <h3
          data-text={track.title}
          className="font-display text-sm leading-snug text-white truncate glitch-text"
        >
          {track.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-300 truncate">
          <span className="text-[#00FFFF]">{track.artist}</span>
          <span aria-hidden="true">//</span>
          <span className="text-[#FF00FF]">{track.genre}</span>
        </div>
      </div>

      {/* Quantized Pixel Spectrum Canvas */}
      <div className="mt-4 h-12 w-full bg-black border border-[#00FFFF]/50 px-2 py-1.5">
        <canvas ref={visualizerRef} className="block w-full h-full" />
      </div>

      {/* Progress Scrubber */}
      <div className="mt-4">
        <input
          type="range"
          min={0}
          max={track.durationSeconds}
          step={1}
          value={Math.floor(elapsedSeconds)}
          aria-label="Track seek position"
          onChange={(e) => onSeek(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #FF00FF ${progressPct}%, rgba(0,255,255,0.2) ${progressPct}%)`,
          }}
          className="neon-range w-full h-1.5"
        />
        <div className="mt-1.5 flex items-center justify-between font-mono text-xs tabular-nums text-[#00FFFF]">
          <span>{formatTime(elapsedSeconds)}</span>
          <span className="text-[#FF00FF]">{formatTime(track.durationSeconds)}</span>
        </div>
      </div>

      {/* Primary Transport Buttons */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleLoop}
          aria-label={isLooping ? 'Disable track loop' : 'Enable track loop'}
          aria-pressed={isLooping}
          title={isLooping ? 'LOOP_ACTIVE' : 'AUTO_ADVANCE'}
          className={`min-h-[40px] min-w-[40px] flex items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF] ${
            isLooping
              ? 'bg-[#FF00FF]/20 border-[#FF00FF] text-[#FF00FF]'
              : 'bg-black border-white/25 text-slate-400 hover:text-white hover:border-[#00FFFF]'
          }`}
        >
          <Repeat className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevTrack}
            aria-label="Previous track"
            title="PREV_STREAM (P)"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-black hover:bg-[#00FFFF]/15 border border-[#00FFFF]/60 text-[#00FFFF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF00FF]"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause music' : 'Play music'}
            className="min-h-[46px] min-w-[54px] px-4 flex items-center justify-center bg-[#00FFFF] hover:bg-[#FF00FF] text-black font-bold border-2 border-[#FF00FF] shadow-[3px_3px_0_0_#FF00FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onNextTrack}
            aria-label="Next track"
            title="NEXT_STREAM (N)"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-black hover:bg-[#00FFFF]/15 border border-[#00FFFF]/60 text-[#00FFFF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF00FF]"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleSfxMute}
          aria-pressed={!isSfxMuted}
          title={isSfxMuted ? 'SFX_OFF' : 'SFX_ON'}
          className={`min-h-[40px] px-2.5 text-[11px] font-bold border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF] ${
            !isSfxMuted
              ? 'bg-[#00FFFF]/15 border-[#00FFFF] text-[#00FFFF]'
              : 'bg-black border-white/25 text-slate-400 hover:text-white'
          }`}
        >
          SFX:{isSfxMuted ? '0' : '1'}
        </button>
      </div>

      {/* Volume Control */}
      <div className="mt-auto pt-4 border-t-2 border-[#FF00FF]/30 flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={isMuted ? 'Unmute music' : 'Mute music'}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[#00FFFF] hover:text-[#FF00FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF]"
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4 text-[#FF00FF]" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#00FFFF]" />
          )}
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          aria-label="Music volume"
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #00FFFF ${(isMuted ? 0 : volume) * 100}%, rgba(255,0,255,0.22) ${(isMuted ? 0 : volume) * 100}%)`,
          }}
          className="neon-range flex-1 h-1.5"
        />

        <span className="w-10 text-right font-mono text-xs tabular-nums text-[#FF00FF]">
          {Math.round((isMuted ? 0 : volume) * 100)}%
        </span>
      </div>
    </aside>
  );
};
