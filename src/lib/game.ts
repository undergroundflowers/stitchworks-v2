/**
 * Game / session state — currently the gamification HUD values shown in the
 * top bar (currency, level, XP, efficiency, achievements). Today this is a
 * static demo object; it will eventually move into the project file format
 * (`.swproj`) and be derived from real simulation runs.
 */

export interface GameState {
  factoryName: string;
  level: number;
  xp: number;
  xpForNext: number;
  /** In-game currency / factory bank. */
  currency: number;
  /** Overall efficiency %, used by the top-bar EFF chip. */
  efficiency: number;
  currentOrder: string;
  achievements: number;
  totalAchievements: number;
  day: number;
  shift: string;
}

export const INITIAL_GAME: GameState = {
  factoryName: 'Test Factory',
  level: 7,
  xp: 2840,
  xpForNext: 4000,
  currency: 184500,
  efficiency: 78,
  currentOrder: 'PO-4421',
  achievements: 12,
  totalAchievements: 36,
  day: 14,
  shift: 'A',
};
