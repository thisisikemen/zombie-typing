import { beforeEach, describe, expect, it } from 'vitest';
import { loadBest, loadVsBest, saveBest, saveVsBest } from '../src/ui/store';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});

describe('VS自己ベスト保存', () => {
  beforeEach(() => localStorage.clear());

  it('勝った走りの撃破数と正打タイムラインを難易度別に保存する', () => {
    saveVsBest('easy', {
      version: 1,
      kills: 18,
      wpm: 286,
      accuracy: 0.97,
      shotTimesMs: [920, 480, 1310],
      killTimesMs: [3100, 1800],
      keysPerKill: 8.4,
    });

    expect(loadVsBest('easy')).toEqual({
      version: 1,
      kills: 18,
      wpm: 286,
      accuracy: 0.97,
      shotTimesMs: [480, 920, 1310],
      killTimesMs: [1800, 3100],
      keysPerKill: 8.4,
    });
    expect(loadVsBest('normal')).toBeNull();
  });

  it('VS専用記録を保存しても通常モードの自己ベストを変更しない', () => {
    saveBest('dawn', 'easy', {
      score: 5000,
      kills: 14,
      maxCombo: 9,
      accuracy: 0.95,
      cleared: true,
      wpm: 230,
    });
    saveVsBest('easy', {
      version: 1,
      kills: 16,
      wpm: 260,
      accuracy: 0.96,
      shotTimesMs: [800, 1050],
      killTimesMs: [2100],
      keysPerKill: 8,
    });

    expect(loadBest('dawn', 'easy')?.kills).toBe(14);
    expect(loadVsBest('easy')?.kills).toBe(16);
  });
});
