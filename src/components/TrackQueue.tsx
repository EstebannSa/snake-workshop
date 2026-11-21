import React, { useState } from 'react';
import { Music, Pause, Play } from 'lucide-react';
import { Track } from '../types/app';

interface TrackQueueProps {
  tracks: Track[];
  currentTrackId: string;
  isPlaying: boolean;
  onSelectTrack: (index: number) => void;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const TrackQueue: React.FC<TrackQueueProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  onSelectTrack,
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  return (
    <aside
      id="playlist"
      aria-label="Audio Signal Queue"
      className="flex flex-col bg-[#05020A] glitch-frame-magenta p-4 sm:p-5 h-full"
    >
      <div className="flex items-baseline justify-between gap-2 pb-3 border-b-2 border-[#FF00FF]/40">
        <h2
          data-text="SIGNAL_QUEUE"
          className="font-display text-xs tracking-wide text-[#00FFFF] glitch-text"
        >
          SIGNAL_QUEUE
        </h2>
        <span className="font-mono text-xs tabular-nums text-[#FF00FF]">
          03_STREAMS
        </span>
      </div>

      <p className="mt-3 text-xs text-slate-300 leading-relaxed">
        SYNTH_LOOPS ACTIVE IN BACKGROUND PROCESS.
      </p>

      {/* Track List */}
      <div className="mt-4 flex flex-col gap-2.5">
        {tracks.map((track, idx) => {
          const isCurrent = track.id === currentTrackId;
          const imgFailed = failedImages[track.id];

          return (
            <button
              key={track.id}
              type="button"
              onClick={() => onSelectTrack(idx)}
              className={`group flex items-center gap-3 w-full p-2.5 text-left transition-transform duration-75 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF] ${
                isCurrent
                  ? 'bg-[#00FFFF]/10 border-[#00FFFF] shadow-[3px_3px_0_0_#FF00FF]'
                  : 'bg-black/70 border-[#FF00FF]/35 hover:border-[#00FFFF] hover:-translate-x-0.5'
              }`}
            >
              {/* Thumbnail Cover */}
              <div className="relative w-12 h-12 shrink-0 bg-black border border-[#00FFFF]/60 flex items-center justify-center overflow-hidden">
                {!imgFailed ? (
                  <img
                    src={track.coverImage}
                    alt={`${track.title} album cover`}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [track.id]: true }))
                    }
                    className="w-full h-full object-cover contrast-125 saturate-150"
                  />
                ) : (
                  <Music className="w-5 h-5 text-[#00FFFF]" />
                )}

                <div
                  className={`absolute inset-0 flex items-center justify-center bg-black/70 transition-opacity ${
                    isCurrent
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {isCurrent && isPlaying ? (
                    <Pause className="w-4 h-4 text-[#FF00FF]" />
                  ) : (
                    <Play className="w-4 h-4 text-[#00FFFF] fill-current ml-0.5" />
                  )}
                </div>
              </div>

              {/* Unboxed Track Metadata */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold truncate ${
                      isCurrent ? 'text-[#00FFFF]' : 'text-white'
                    }`}
                  >
                    {track.title}
                  </span>

                  {isCurrent && isPlaying && (
                    <span
                      aria-label="Playing"
                      className="flex items-end gap-0.5 h-3.5 shrink-0"
                    >
                      <span className="w-1 h-full bg-[#FF00FF] origin-bottom animate-eq-1" />
                      <span className="w-1 h-full bg-[#00FFFF] origin-bottom animate-eq-2" />
                      <span className="w-1 h-full bg-[#FF00FF] origin-bottom animate-eq-3" />
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-300 truncate">
                  <span className="text-[#FF00FF]">{track.genre}</span>
                  <span aria-hidden="true">/</span>
                  <span className="font-mono tabular-nums">{track.bpm}BPM</span>
                  <span aria-hidden="true">/</span>
                  <span className="font-mono tabular-nums">
                    {formatDuration(track.durationSeconds)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Cryptic Keyboard Bindings */}
      <div
        id="controls"
        className="mt-auto pt-5 border-t-2 border-[#00FFFF]/30"
      >
        <h3 className="font-display text-[10px] text-[#FF00FF]">
          INPUT_MATRIX
        </h3>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-300">VECTOR</dt>
            <dd className="font-mono text-[#00FFFF]">ARROWS / WASD</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-300">HALT_LINK</dt>
            <dd className="font-mono text-[#00FFFF]">SPACE</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-300">REBOOT</dt>
            <dd className="font-mono text-[#00FFFF]">R</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-300">CYCLE_TRK</dt>
            <dd className="font-mono text-[#FF00FF]">N / P</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-300">SILENCE</dt>
            <dd className="font-mono text-[#FF00FF]">M</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
};
