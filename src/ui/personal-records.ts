import { personalRecords } from '../core/personal-records';
import type { CorrectableDifficulty } from '../core/record-correction';
import { mountRecordCorrection } from './record-correction';

export function initPersonalRecords() {
  const storage = personalRecords();
  mountRecordCorrection(storage);
  return {
    save(difficulty: CorrectableDifficulty, value: number): void {
      // Best effort: optional local storage never delays play or ranking submission.
      void Promise.resolve().then(() => storage.append({
        id: crypto.randomUUID(), difficulty, value, playedAt: Date.now(),
      })).catch(() => {});
    },
  };
}
