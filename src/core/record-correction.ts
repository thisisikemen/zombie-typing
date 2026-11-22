/** Publicly ranked stages only. Basic practice and VS ghost records are separate. */
export const CORRECTABLE_DIFFICULTIES = ['easy', 'normal', 'hard', 'hardcore', 'endless'] as const;
export type CorrectableDifficulty = (typeof CORRECTABLE_DIFFICULTIES)[number];

export interface RecentRankedRun {
  id: string;
  difficulty: CorrectableDifficulty;
  playedAt: number;
  /** Score or, for Endless only, elapsed seconds. */
  value: number;
  excluded: boolean;
}

export interface BestAnchor {
  difficulty: CorrectableDifficulty;
  value: number;
  playedAt: number;
}

export interface CorrectionSnapshot {
  /** A future server checks this revision again when it applies a preview. */
  revision: string;
  serverNow: number;
  /** Highest verified eligible replay before the correction window, not editable here. */
  anchors: readonly BestAnchor[];
  runs: readonly RecentRankedRun[];
}

export interface CorrectionChange {
  runId: string;
  excluded: boolean;
}

export interface CorrectionImpact {
  difficulty: CorrectableDifficulty;
  before: number | null;
  after: number | null;
}

export interface CorrectionBackend {
  load(): Promise<CorrectionSnapshot>;
  preview?(revision: string, changes: readonly CorrectionChange[]): Promise<readonly CorrectionImpact[]>;
  apply(revision: string, changes: readonly CorrectionChange[]): Promise<CorrectionSnapshot>;
}

const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function correctionRuns(snapshot: CorrectionSnapshot): RecentRankedRun[] {
  return snapshot.runs
    .filter(run => run.playedAt > snapshot.serverNow - CORRECTION_WINDOW_MS && run.playedAt <= snapshot.serverNow)
    .sort((a, b) => b.playedAt - a.playedAt || a.id.localeCompare(b.id));
}

export function correctionRange(rows: readonly RecentRankedRun[], first: string, last: string): string[] {
  const a = rows.findIndex(run => run.id === first);
  const b = rows.findIndex(run => run.id === last);
  if (a < 0 || b < 0) return [];
  return rows.slice(Math.min(a, b), Math.max(a, b) + 1).map(run => run.id);
}

export function correctionChanges(
  snapshot: CorrectionSnapshot,
  selected: ReadonlySet<string>,
  excluded: boolean,
): CorrectionChange[] {
  return correctionRuns(snapshot)
    .filter(run => selected.has(run.id) && run.excluded !== excluded)
    .map(run => ({ runId: run.id, excluded }));
}

export function previewCorrection(snapshot: CorrectionSnapshot, changes: readonly CorrectionChange[]) {
  const edits = new Map(changes.map(c => [c.runId, c.excluded]));
  const runs = correctionRuns(snapshot);
  return CORRECTABLE_DIFFICULTIES.flatMap(difficulty => {
    const stageRuns = runs.filter(run => run.difficulty === difficulty);
    if (!stageRuns.some(run => edits.has(run.id))) return [];
    const values = (updated: boolean) => [
      ...snapshot.anchors.filter(anchor => anchor.difficulty === difficulty).map(anchor => anchor.value),
      ...stageRuns.filter(run => !(updated ? edits.get(run.id) ?? run.excluded : run.excluded)).map(run => run.value),
    ];
    const best = (candidates: number[]) => candidates.reduce<number | null>(
      (max, value) => max === null ? value : Math.max(max, value), null,
    );
    return [{ difficulty, before: best(values(false)), after: best(values(true)) }];
  });
}
