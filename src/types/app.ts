export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type Difficulty = 'chill' | 'classic' | 'hyper';

export type WallMode = 'solid' | 'wrap';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Point {
  x: number;
  y: number;
}

export interface FoodItem {
  x: number;
  y: number;
  kind: 'standard' | 'bonus';
  expiresAt?: number;
}

export type SynthStyle = 'synthwave' | 'chillwave' | 'electro';

export interface TrackPattern {
  chords: number[][]; // 4 bars, MIDI note arrays
  bass: number[]; // 64 steps (16th notes), 0 = rest
  arp: number[]; // 64 steps, 0 = rest
  lead: number[]; // 64 steps, 0 = rest
  kick: number[]; // 16 steps (repeats per bar)
  snare: number[]; // 16 steps
  hat: number[]; // 16 steps
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  durationSeconds: number;
  coverImage: string;
  accentColor: string;
  secondaryColor: string;
  style: SynthStyle;
  pattern: TrackPattern;
}
