import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { synthEngine } from './audio/synthEngine';
import { MusicPlayerPanel } from './components/MusicPlayerPanel';
import { SnakeArena } from './components/SnakeArena';
import { TrackQueue } from './components/TrackQueue';
import { DEMO_TRACKS } from './data/tracks';

const HIGH_SCORE_STORAGE_KEY = 'neoncoil_high_score';

export default function App() {
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(0.72);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSfxMuted, setIsSfxMuted] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
      return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
    } catch {
      return 0;
    }
  });

  const userManuallyPausedRef = useRef<boolean>(false);
  const currentTrack = DEMO_TRACKS[currentTrackIndex];

  useEffect(() => {
    synthEngine.setTrack(DEMO_TRACKS[0], false);
    synthEngine.setVolume(volume);
    synthEngine.setLooping(isLooping);
    return () => {
      synthEngine.pause();
    };
  }, []);

  const handleNextTrack = useCallback(() => {
    setCurrentTrackIndex((prev) => {
      const nextIdx = (prev + 1) % DEMO_TRACKS.length;
      const nextTrack = DEMO_TRACKS[nextIdx];
      synthEngine.setTrack(nextTrack, isMusicPlaying);
      setElapsedSeconds(0);
      return nextIdx;
    });
  }, [isMusicPlaying]);

  const handlePrevTrack = useCallback(() => {
    if (synthEngine.getElapsedSeconds() > 3) {
      synthEngine.seek(0);
      setElapsedSeconds(0);
      return;
    }
    setCurrentTrackIndex((prev) => {
      const prevIdx = (prev - 1 + DEMO_TRACKS.length) % DEMO_TRACKS.length;
      const prevTrack = DEMO_TRACKS[prevIdx];
      synthEngine.setTrack(prevTrack, isMusicPlaying);
      setElapsedSeconds(0);
      return prevIdx;
    });
  }, [isMusicPlaying]);

  useEffect(() => {
    synthEngine.setOnTrackEnd(() => {
      setCurrentTrackIndex((prev) => {
        const nextIdx = (prev + 1) % DEMO_TRACKS.length;
        const nextTrack = DEMO_TRACKS[nextIdx];
        synthEngine.setTrack(nextTrack, true);
        setElapsedSeconds(0);
        return nextIdx;
      });
    });
  }, []);

  useEffect(() => {
    if (!isMusicPlaying) return;
    const id = window.setInterval(() => {
      setElapsedSeconds(synthEngine.getElapsedSeconds());
    }, 250);
    return () => window.clearInterval(id);
  }, [isMusicPlaying]);

  const handleTogglePlay = useCallback(() => {
    if (isMusicPlaying) {
      userManuallyPausedRef.current = true;
      synthEngine.pause();
      setIsMusicPlaying(false);
    } else {
      userManuallyPausedRef.current = false;
      synthEngine.play(currentTrack);
      setIsMusicPlaying(true);
    }
  }, [currentTrack, isMusicPlaying]);

  const handleSelectTrack = useCallback(
    (index: number) => {
      const targetTrack = DEMO_TRACKS[index];
      if (!targetTrack) return;

      if (index === currentTrackIndex) {
        handleTogglePlay();
        return;
      }

      userManuallyPausedRef.current = false;
      setCurrentTrackIndex(index);
      setElapsedSeconds(0);
      synthEngine.setTrack(targetTrack, true);
      setIsMusicPlaying(true);
    },
    [currentTrackIndex, handleTogglePlay]
  );

  const handleToggleLoop = useCallback(() => {
    setIsLooping((prev) => {
      const next = !prev;
      synthEngine.setLooping(next);
      return next;
    });
  }, []);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    synthEngine.setVolume(val);
    if (val > 0) {
      setIsMuted(false);
      synthEngine.setMuted(false);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      synthEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleSfxMute = useCallback(() => {
    setIsSfxMuted((prev) => {
      const next = !prev;
      synthEngine.setSfxMuted(next);
      return next;
    });
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    synthEngine.seek(seconds);
    setElapsedSeconds(seconds);
  }, []);

  const handleScoreChange = useCallback((newScore: number) => {
    setScore(newScore);
    setHighScore((prevBest) => {
      if (newScore > prevBest) {
        try {
          window.localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(newScore));
        } catch {
          // Ignore storage quota errors
        }
        return newScore;
      }
      return prevBest;
    });
  }, []);

  const handleFirstGameStart = useCallback(() => {
    if (!isMusicPlaying && !userManuallyPausedRef.current) {
      synthEngine.play(currentTrack);
      setIsMusicPlaying(true);
    }
  }, [currentTrack, isMusicPlaying]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleNextTrack();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handlePrevTrack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNextTrack, handlePrevTrack, handleToggleMute]);

  return (
    <div className="relative min-h-screen flex flex-col bg-[#020106] text-white overflow-x-hidden">
      {/* Glitch Art Screen Scanlines, Static Noise & Tear Sweep Overlays */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 glitch-scanlines opacity-35"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -inset-4 z-50 glitch-static-noise opacity-25"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 right-0 top-0 h-1.5 z-50 bg-gradient-to-r from-[#00FFFF]/60 via-[#FF00FF]/70 to-[#00FFFF]/60 glitch-tear-band"
      />

      {/* 3-Zone Glitch Header */}
      <header className="relative z-10 border-b-2 border-[#00FFFF] bg-black/95 shadow-[0_2px_0_0_#FF00FF]">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#arena"
            data-text="NEONCOIL.SYS"
            className="font-display text-sm sm:text-base tracking-wide text-white glitch-text whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF]"
          >
            NEONCOIL.SYS
          </a>

          <nav
            aria-label="System sectors"
            className="hidden md:flex items-center gap-6 text-xs font-bold text-slate-300"
          >
            <a
              href="#arena"
              className="hover:text-[#00FFFF] transition-colors whitespace-nowrap shrink-0"
            >
              GRID
            </a>
            <a
              href="#playlist"
              className="hover:text-[#FF00FF] transition-colors whitespace-nowrap shrink-0"
            >
              QUEUE
            </a>
            <a
              href="#player"
              className="hover:text-[#00FFFF] transition-colors whitespace-nowrap shrink-0"
            >
              DAEMON
            </a>
            <a
              href="#controls"
              className="hover:text-[#FF00FF] transition-colors whitespace-nowrap shrink-0"
            >
              MATRIX
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="inline-flex items-center justify-center min-h-[38px] px-4 py-2 text-xs font-bold bg-[#FF00FF] hover:bg-[#00FFFF] text-black border-2 border-[#00FFFF] shadow-[3px_3px_0_0_#00FFFF] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {isMusicPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 mr-1.5 fill-current" />
                  HALT_AUDIO
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                  EXEC_AUDIO
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main 3-Column Glitch Workspace with Snake in Center Window */}
      <main className="relative z-10 flex-1 w-full max-w-[1380px] mx-auto px-4 sm:px-6 py-5 lg:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[285px_minmax(0,1fr)_300px] xl:grid-cols-[305px_minmax(0,1fr)_320px] gap-6 items-stretch">
          <div className="order-2 lg:order-1">
            <TrackQueue
              tracks={DEMO_TRACKS}
              currentTrackId={currentTrack.id}
              isPlaying={isMusicPlaying}
              onSelectTrack={handleSelectTrack}
            />
          </div>

          <div id="arena" className="order-1 lg:order-2 flex flex-col justify-center">
            <SnakeArena
              score={score}
              highScore={highScore}
              onScoreChange={handleScoreChange}
              onFirstGameStart={handleFirstGameStart}
              isMusicPlaying={isMusicPlaying}
            />
          </div>

          <div id="player" className="order-3 lg:order-3">
            <MusicPlayerPanel
              track={currentTrack}
              isPlaying={isMusicPlaying}
              isLooping={isLooping}
              volume={volume}
              isMuted={isMuted}
              isSfxMuted={isSfxMuted}
              elapsedSeconds={elapsedSeconds}
              onTogglePlay={handleTogglePlay}
              onPrevTrack={handlePrevTrack}
              onNextTrack={handleNextTrack}
              onToggleLoop={handleToggleLoop}
              onVolumeChange={handleVolumeChange}
              onToggleMute={handleToggleMute}
              onToggleSfxMute={handleToggleSfxMute}
              onSeek={handleSeek}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
