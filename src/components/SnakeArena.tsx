import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { synthEngine } from '../audio/synthEngine';
import {
  Difficulty,
  Direction,
  FoodItem,
  GameState,
  Point,
  WallMode,
} from '../types/app';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface SnakeArenaProps {
  score: number;
  highScore: number;
  onScoreChange: (newScore: number) => void;
  onFirstGameStart: () => void;
  isMusicPlaying: boolean;
}

const GRID_SIZE = 20;

const BASE_SPEED_MS: Record<Difficulty, number> = {
  chill: 140,
  classic: 102,
  hyper: 70,
};

const OPPOSITE_DIR: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

const INITIAL_SNAKE: Point[] = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
];

function spawnFood(occupied: Point[], kind: 'standard' | 'bonus' = 'standard'): FoodItem {
  const occupiedSet = new Set(occupied.map((p) => `${p.x},${p.y}`));
  const freeCells: Point[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!occupiedSet.has(`${x},${y}`)) {
        freeCells.push({ x, y });
      }
    }
  }
  const pick =
    freeCells.length > 0
      ? freeCells[Math.floor(Math.random() * freeCells.length)]
      : { x: 0, y: 0 };

  return {
    x: pick.x,
    y: pick.y,
    kind,
    expiresAt: kind === 'bonus' ? performance.now() + 7500 : undefined,
  };
}

export const SnakeArena: React.FC<SnakeArenaProps> = ({
  score,
  highScore,
  onScoreChange,
  onFirstGameStart,
  isMusicPlaying,
}) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [difficulty, setDifficulty] = useState<Difficulty>('classic');
  const [wallMode, setWallMode] = useState<WallMode>('solid');
  const [snakeLength, setSnakeLength] = useState<number>(INITIAL_SNAKE.length);
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameStateRef = useRef<GameState>('TITLE_MENU');
  const difficultyRef = useRef<Difficulty>('classic');
  const wallModeRef = useRef<WallMode>('solid');
  const snakeRef = useRef<Point[]>([...INITIAL_SNAKE]);
  const dirRef = useRef<Direction>('RIGHT');
  const dirQueueRef = useRef<Direction[]>([]);
  const foodRef = useRef<FoodItem>({ x: 15, y: 10, kind: 'standard' });
  const bonusFoodRef = useRef<FoodItem | null>(null);
  const eatenCountRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const highScoreRef = useRef<number>(highScore);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const lastStepTimeRef = useRef<number>(0);
  const tearFramesRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    wallModeRef.current = wallMode;
  }, [wallMode]);

  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);

  const spawnBurst = useCallback((gridX: number, gridY: number, color: string, count = 14) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 0.08 + Math.random() * 0.16;
      particlesRef.current.push({
        x: gridX + 0.5,
        y: gridY + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: i % 2 === 0 ? color : '#00FFFF',
        size: 3 + Math.random() * 3,
      });
    }
  }, []);

  const resetAndStartGame = useCallback(() => {
    const startSnake = INITIAL_SNAKE.map((p) => ({ ...p }));
    snakeRef.current = startSnake;
    dirRef.current = 'RIGHT';
    dirQueueRef.current = [];
    eatenCountRef.current = 0;
    scoreRef.current = 0;
    bonusFoodRef.current = null;
    particlesRef.current = [];
    floatingTextsRef.current = [];
    tearFramesRef.current = 6;
    foodRef.current = spawnFood(startSnake, 'standard');
    lastStepTimeRef.current = performance.now();

    setIsNewRecord(false);
    setSnakeLength(startSnake.length);
    onScoreChange(0);
    setGameState('PLAYING');
    gameStateRef.current = 'PLAYING';

    synthEngine.playStartSound();
    onFirstGameStart();
  }, [onFirstGameStart, onScoreChange]);

  const togglePause = useCallback(() => {
    if (gameStateRef.current === 'PLAYING') {
      setGameState('PAUSED');
    } else if (gameStateRef.current === 'PAUSED') {
      lastStepTimeRef.current = performance.now();
      setGameState('PLAYING');
    } else if (gameStateRef.current === 'TITLE_MENU' || gameStateRef.current === 'GAME_OVER') {
      resetAndStartGame();
    }
  }, [resetAndStartGame]);

  const queueDirection = useCallback((nextDir: Direction) => {
    if (gameStateRef.current !== 'PLAYING') return;
    const queue = dirQueueRef.current;
    const lastPlanned = queue.length > 0 ? queue[queue.length - 1] : dirRef.current;
    if (nextDir === lastPlanned || OPPOSITE_DIR[lastPlanned] === nextDir) {
      return;
    }
    if (queue.length < 3) {
      queue.push(nextDir);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          queueDirection('UP');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          queueDirection('DOWN');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          queueDirection('LEFT');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          queueDirection('RIGHT');
          break;
        case ' ':
          e.preventDefault();
          togglePause();
          break;
        case 'Enter':
          if (gameStateRef.current !== 'PLAYING') {
            e.preventDefault();
            resetAndStartGame();
          }
          break;
        case 'r':
        case 'R':
          if (
            gameStateRef.current === 'PLAYING' ||
            gameStateRef.current === 'PAUSED' ||
            gameStateRef.current === 'GAME_OVER'
          ) {
            e.preventDefault();
            resetAndStartGame();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [queueDirection, resetAndStartGame, togglePause]);

  // Main Game Loop & Glitch Pixel Canvas Renderer
  useEffect(() => {
    let rafId = 0;

    const triggerGameOver = (crashX: number, crashY: number) => {
      tearFramesRef.current = 14;
      spawnBurst(crashX, crashY, '#FF00FF', 26);
      synthEngine.playGameOverSound();
      setGameState('GAME_OVER');
      gameStateRef.current = 'GAME_OVER';
    };

    const stepGame = (now: number) => {
      const snake = snakeRef.current;
      if (dirQueueRef.current.length > 0) {
        dirRef.current = dirQueueRef.current.shift()!;
      }

      const head = snake[0];
      let nextX = head.x;
      let nextY = head.y;

      switch (dirRef.current) {
        case 'UP':
          nextY -= 1;
          break;
        case 'DOWN':
          nextY += 1;
          break;
        case 'LEFT':
          nextX -= 1;
          break;
        case 'RIGHT':
          nextX += 1;
          break;
      }

      if (wallModeRef.current === 'wrap') {
        nextX = (nextX + GRID_SIZE) % GRID_SIZE;
        nextY = (nextY + GRID_SIZE) % GRID_SIZE;
      } else {
        if (nextX < 0 || nextX >= GRID_SIZE || nextY < 0 || nextY >= GRID_SIZE) {
          triggerGameOver(head.x, head.y);
          return;
        }
      }

      const willEatStandard =
        nextX === foodRef.current.x && nextY === foodRef.current.y;
      const willEatBonus =
        bonusFoodRef.current !== null &&
        nextX === bonusFoodRef.current.x &&
        nextY === bonusFoodRef.current.y;

      const bodyToCheck = willEatStandard || willEatBonus ? snake : snake.slice(0, -1);
      const hitSelf = bodyToCheck.some((seg) => seg.x === nextX && seg.y === nextY);

      if (hitSelf) {
        triggerGameOver(nextX, nextY);
        return;
      }

      const nextSnake = [{ x: nextX, y: nextY }, ...snake];
      if (!willEatStandard && !willEatBonus) {
        nextSnake.pop();
      }
      snakeRef.current = nextSnake;

      if (willEatStandard) {
        eatenCountRef.current += 1;
        tearFramesRef.current = 5;
        const nextScore = scoreRef.current + 10;
        scoreRef.current = nextScore;
        if (nextScore > highScoreRef.current) {
          setIsNewRecord(true);
        }
        onScoreChange(nextScore);
        setSnakeLength(nextSnake.length);
        spawnBurst(nextX, nextY, '#FF00FF', 14);
        floatingTextsRef.current.push({
          x: nextX + 0.5,
          y: nextY + 0.2,
          text: '+10',
          color: '#00FFFF',
          life: 1,
        });
        synthEngine.playEatSound(false);

        const occupied = bonusFoodRef.current
          ? [...nextSnake, bonusFoodRef.current]
          : nextSnake;
        foodRef.current = spawnFood(occupied, 'standard');

        if (eatenCountRef.current % 5 === 0 && !bonusFoodRef.current) {
          bonusFoodRef.current = spawnFood([...nextSnake, foodRef.current], 'bonus');
        }
      }

      if (willEatBonus && bonusFoodRef.current) {
        tearFramesRef.current = 8;
        const nextScore = scoreRef.current + 30;
        scoreRef.current = nextScore;
        if (nextScore > highScoreRef.current) {
          setIsNewRecord(true);
        }
        onScoreChange(nextScore);
        setSnakeLength(nextSnake.length);
        spawnBurst(nextX, nextY, '#FFFF00', 22);
        floatingTextsRef.current.push({
          x: nextX + 0.5,
          y: nextY + 0.2,
          text: '+30',
          color: '#FFFF00',
          life: 1,
        });
        synthEngine.playEatSound(true);
        bonusFoodRef.current = null;
      }

      if (
        bonusFoodRef.current?.expiresAt &&
        now > bonusFoodRef.current.expiresAt
      ) {
        bonusFoodRef.current = null;
      }
    };

    const renderFrame = (now: number) => {
      if (gameStateRef.current === 'PLAYING') {
        const baseSpeed = BASE_SPEED_MS[difficultyRef.current];
        const speedBonus = Math.min(28, Math.floor(scoreRef.current / 50) * 3);
        const interval = Math.max(52, baseSpeed - speedBonus);
        if (now - lastStepTimeRef.current >= interval) {
          lastStepTimeRef.current = now;
          stepGame(now);
        }
      }

      const canvas = canvasRef.current;
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

          const width = rect.width;
          const height = rect.height;
          const cell = width / GRID_SIZE;

          let beatEnergy = 0;
          if (isMusicPlaying) {
            synthEngine.getFrequencyData(freqDataRef.current);
            const bassSum =
              freqDataRef.current[0] + freqDataRef.current[1] + freqDataRef.current[2];
            beatEnergy = Math.min(1, bassSum / (255 * 3));
          }

          // Pure void arena backdrop
          ctx.fillStyle = '#020106';
          ctx.fillRect(0, 0, width, height);

          // Crisp Cyan pixel grid
          ctx.strokeStyle = `rgba(0, 255, 255, ${0.09 + beatEnergy * 0.09})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 1; i < GRID_SIZE; i++) {
            const pos = Math.round(i * cell) + 0.5;
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, height);
            ctx.moveTo(0, pos);
            ctx.lineTo(width, pos);
          }
          ctx.stroke();

          // Standard Magenta Target Block with Cyan chromatic ghost
          const food = foodRef.current;
          const blink = Math.floor(now / 180) % 2 === 0;
          const fPad = cell * 0.16;
          const fSize = cell - fPad * 2;
          const fx = food.x * cell + fPad;
          const fy = food.y * cell + fPad;

          // Chromatic Cyan offset ghost
          ctx.fillStyle = 'rgba(0, 255, 255, 0.75)';
          ctx.fillRect(fx - 2.5, fy + 1.5, fSize, fSize);

          // Primary Magenta block
          ctx.fillStyle = blink ? '#FF00FF' : '#FF33FF';
          ctx.fillRect(fx, fy, fSize, fSize);

          // Crisp inner white core
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(fx + fSize * 0.3, fy + fSize * 0.3, fSize * 0.4, fSize * 0.4);

          // Bonus Overdrive Node
          const bonus = bonusFoodRef.current;
          if (bonus && bonus.expiresAt) {
            const remainingRatio = Math.max(0, (bonus.expiresAt - now) / 7500);
            const bx = bonus.x * cell + fPad * 0.7;
            const by = bonus.y * cell + fPad * 0.7;
            const bSize = cell - fPad * 1.4;

            ctx.fillStyle = '#FF00FF';
            ctx.fillRect(bx + 2, by - 2, bSize, bSize);
            ctx.fillStyle = '#FFFF00';
            ctx.fillRect(bx, by, bSize, bSize);

            // Pixel countdown bar above bonus node
            ctx.fillStyle = '#00FFFF';
            ctx.fillRect(bx, by - 4, bSize * remainingRatio, 2.5);
          }

          // Snake Segments (blocky pixel-grid with chromatic glitch trail)
          const snake = snakeRef.current;
          for (let i = snake.length - 1; i >= 0; i--) {
            const seg = snake[i];
            const isHead = i === 0;
            const pad = isHead ? cell * 0.08 : cell * 0.14;
            const size = cell - pad * 2;
            const rx = seg.x * cell + pad;
            const ry = seg.y * cell + pad;

            if (isHead) {
              // Magenta RGB split shadow behind head
              ctx.fillStyle = '#FF00FF';
              ctx.fillRect(rx + 2.5, ry + 1.5, size, size);
              ctx.fillStyle = '#00FFFF';
              ctx.fillRect(rx, ry, size, size);

              // Sharp pixel eyes
              ctx.fillStyle = '#020106';
              const eyeSize = Math.max(2.5, Math.floor(cell * 0.16));
              let e1x = rx + size * 0.68;
              let e1y = ry + size * 0.22;
              let e2x = rx + size * 0.68;
              let e2y = ry + size * 0.62;

              if (dirRef.current === 'LEFT') {
                e1x = rx + size * 0.16;
                e2x = rx + size * 0.16;
              } else if (dirRef.current === 'UP') {
                e1x = rx + size * 0.22;
                e1y = ry + size * 0.16;
                e2x = rx + size * 0.62;
                e2y = ry + size * 0.16;
              } else if (dirRef.current === 'DOWN') {
                e1x = rx + size * 0.22;
                e1y = ry + size * 0.68;
                e2x = rx + size * 0.62;
                e2y = ry + size * 0.68;
              }

              ctx.fillRect(e1x, e1y, eyeSize, eyeSize);
              ctx.fillRect(e2x, e2y, eyeSize, eyeSize);
            } else {
              const alpha = Math.max(0.4, 0.95 - (i / Math.max(1, snake.length)) * 0.5);
              ctx.fillStyle =
                i % 3 === 0
                  ? `rgba(255, 0, 255, ${alpha * 0.8})`
                  : `rgba(0, 255, 255, ${alpha})`;
              ctx.fillRect(rx, ry, size, size);
            }
          }

          // Square pixel burst particles
          particlesRef.current = particlesRef.current.filter((p) => p.life > 0.04);
          for (const p of particlesRef.current) {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;

            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            const s = p.size * p.life;
            ctx.fillRect(p.x * cell - s / 2, p.y * cell - s / 2, s, s);
            ctx.restore();
          }

          // Floating score readouts
          floatingTextsRef.current = floatingTextsRef.current.filter((t) => t.life > 0.05);
          for (const t of floatingTextsRef.current) {
            t.y -= 0.03;
            t.life -= 0.035;

            ctx.save();
            ctx.globalAlpha = Math.max(0, t.life);
            ctx.font = '700 12px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FF00FF';
            ctx.fillText(t.text, t.x * cell + 2, t.y * cell);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, t.x * cell, t.y * cell);
            ctx.restore();
          }

          // Screen-tear glitch slice effect on eat / crash
          if (tearFramesRef.current > 0) {
            tearFramesRef.current -= 1;
            const sliceY = Math.random() * (height - 24);
            const sliceH = 8 + Math.random() * 14;
            ctx.fillStyle = 'rgba(0, 255, 255, 0.25)';
            ctx.fillRect(0, sliceY, width, 2);
            ctx.fillStyle = 'rgba(255, 0, 255, 0.28)';
            ctx.fillRect(0, sliceY + sliceH, width, 2);
          }

          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [isMusicPlaying, onScoreChange, spawnBurst]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      queueDirection(dy > 0 ? 'DOWN' : 'UP');
    }
  };

  return (
    <section
      aria-label="Containment Grid Snake Arena"
      className="flex flex-col bg-[#05020A] glitch-frame p-4 sm:p-5"
    >
      {/* Top Game Telemetry HUD */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-[#FF00FF]/40">
        <div className="flex items-baseline gap-6">
          <div>
            <div className="text-[11px] font-bold text-[#FF00FF]">SCORE</div>
            <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#00FFFF] leading-tight">
              {score}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400">PEAK_MEM</div>
            <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-white leading-tight">
              {highScore}
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[11px] font-bold text-slate-400">NODES</div>
            <div className="font-mono text-lg sm:text-xl font-bold tabular-nums text-[#FF00FF] leading-tight">
              {snakeLength}
            </div>
          </div>
        </div>

        {/* Mode & Execution Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Clock speed"
            className="flex items-center p-0.5 bg-black border border-[#00FFFF]/50"
          >
            {(['chill', 'classic', 'hyper'] as Difficulty[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                className={`px-2 py-1.5 text-[11px] font-bold uppercase transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF00FF] ${
                  difficulty === level
                    ? 'bg-[#00FFFF] text-black'
                    : 'text-slate-300 hover:text-[#00FFFF]'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setWallMode((prev) => (prev === 'solid' ? 'wrap' : 'solid'))}
            className="px-2.5 py-2 text-[11px] font-bold bg-black border border-[#FF00FF]/60 text-[#FF00FF] hover:bg-[#FF00FF] hover:text-black transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF]"
            title="Toggle boundary collision"
          >
            EDGE:{wallMode === 'solid' ? 'HARD' : 'WRAP'}
          </button>

          <button
            type="button"
            onClick={togglePause}
            aria-label={gameState === 'PLAYING' ? 'Pause game' : 'Resume or start game'}
            className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] px-3 py-1.5 text-[11px] font-bold bg-black hover:bg-[#00FFFF]/20 text-[#00FFFF] border border-[#00FFFF] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF00FF]"
          >
            {gameState === 'PLAYING' ? (
              <>
                <Pause className="w-3.5 h-3.5 mr-1.5" />
                HALT
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 mr-1.5" />
                {gameState === 'PAUSED' ? 'RESUME' : 'EXEC'}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={resetAndStartGame}
            aria-label="Reboot run"
            title="REBOOT (R)"
            className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] p-2 bg-black hover:bg-[#FF00FF]/20 text-[#FF00FF] border border-[#FF00FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center Snake Canvas Window */}
      <div className="relative mt-4 w-full max-w-[540px] mx-auto aspect-square border-2 border-[#FF00FF] bg-[#020106] overflow-hidden">
        <canvas
          ref={canvasRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="block w-full h-full touch-none"
        />

        {/* Cryptic Machine-Like Game State Overlays */}
        {gameState === 'TITLE_MENU' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/88 p-6 text-center">
            <h2
              data-text="CONTAINMENT_GRID"
              className="font-display text-lg sm:text-xl text-[#00FFFF] glitch-text leading-relaxed"
            >
              CONTAINMENT_GRID
            </h2>
            <p className="mt-3 max-w-xs text-xs text-slate-200 leading-relaxed">
              STEER VECTOR VIA ARROWS OR WASD. CONSUME MAGENTA NODES. SPACE TO HALT.
            </p>
            <button
              type="button"
              onClick={resetAndStartGame}
              className="mt-6 inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 bg-[#00FFFF] hover:bg-[#FF00FF] text-black font-display text-xs border-2 border-[#FF00FF] shadow-[4px_4px_0_0_#FF00FF] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Play className="w-4 h-4 mr-2 fill-current" />
              INIT_RUN
            </button>
          </div>
        )}

        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/86 p-6 text-center">
            <h2
              data-text="LINK_INTERRUPTED"
              className="font-display text-lg sm:text-xl text-[#FF00FF] glitch-text"
            >
              LINK_INTERRUPTED
            </h2>
            <p className="mt-2 text-xs text-slate-300">
              AUDIO_DAEMON CONTINUES EXECUTION.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={togglePause}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-[#00FFFF] hover:bg-[#FF00FF] text-black font-display text-xs border-2 border-[#FF00FF] shadow-[3px_3px_0_0_#FF00FF] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Play className="w-4 h-4 mr-2 fill-current" />
                RESUME
              </button>
              <button
                type="button"
                onClick={resetAndStartGame}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 bg-black text-[#FF00FF] font-display text-xs border-2 border-[#FF00FF] hover:bg-[#FF00FF] hover:text-black transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF]"
              >
                REBOOT
              </button>
            </div>
          </div>
        )}

        {gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center">
            <div className="text-xs font-bold text-[#00FFFF]">
              {isNewRecord && score > 0 ? 'ERR_OVERFLOW: NEW_PEAK_RECORD' : 'ERR_COLLISION_DETECTED'}
            </div>
            <h2
              data-text="SIGNAL_TERMINATED"
              className="mt-2 font-display text-lg sm:text-xl text-[#FF00FF] glitch-text"
            >
              SIGNAL_TERMINATED
            </h2>
            <div className="mt-4 flex items-center gap-5 text-xs">
              <div>
                <span className="text-slate-400">SCORE:</span>
                <span className="font-mono font-bold tabular-nums text-[#00FFFF]">
                  {score}
                </span>
              </div>
              <span aria-hidden="true" className="text-[#FF00FF]">
                //
              </span>
              <div>
                <span className="text-slate-400">PEAK:</span>
                <span className="font-mono font-bold tabular-nums text-white">
                  {highScore}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={resetAndStartGame}
              className="mt-6 inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 bg-[#FF00FF] hover:bg-[#00FFFF] text-black font-display text-xs border-2 border-[#00FFFF] shadow-[4px_4px_0_0_#00FFFF] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              REBOOT_RUN
            </button>
          </div>
        )}
      </div>

      {/* Touch D-Pad for Mobile / Tablet */}
      <div className="mt-4 grid grid-cols-3 gap-2 w-40 mx-auto lg:hidden" aria-label="Touch directional matrix">
        <div />
        <button
          type="button"
          aria-label="Move Up"
          onClick={() => queueDirection('UP')}
          className="min-h-[44px] flex items-center justify-center bg-black active:bg-[#00FFFF] active:text-black border border-[#00FFFF] text-[#00FFFF]"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
        <div />
        <button
          type="button"
          aria-label="Move Left"
          onClick={() => queueDirection('LEFT')}
          className="min-h-[44px] flex items-center justify-center bg-black active:bg-[#00FFFF] active:text-black border border-[#00FFFF] text-[#00FFFF]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          aria-label="Move Down"
          onClick={() => queueDirection('DOWN')}
          className="min-h-[44px] flex items-center justify-center bg-black active:bg-[#00FFFF] active:text-black border border-[#00FFFF] text-[#00FFFF]"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
        <button
          type="button"
          aria-label="Move Right"
          onClick={() => queueDirection('RIGHT')}
          className="min-h-[44px] flex items-center justify-center bg-black active:bg-[#00FFFF] active:text-black border border-[#00FFFF] text-[#00FFFF]"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
};
