import {
  CORRECTABLE_DIFFICULTIES, correctionChanges, correctionRange, correctionRuns, previewCorrection,
  type CorrectionBackend, type CorrectionSnapshot, type CorrectableDifficulty,
} from '../core/record-correction';

const DIFFICULTY_LABELS: Record<CorrectableDifficulty, string> = {
  easy: 'イージー', normal: 'ノーマル', hard: 'ハード', hardcore: 'ハードコア', endless: 'エンドレス',
};
const ROWS_AT_A_TIME = 20;
const dateTime = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function formatValue(difficulty: CorrectableDifficulty, value: number | null): string {
  if (value === null) return '記録なし';
  if (difficulty !== 'endless') return `${value.toLocaleString('ja-JP')} 点`;
  return `${Math.floor(value / 60)}分${String(value % 60).padStart(2, '0')}秒`;
}

function setText<K extends keyof HTMLElementTagNameMap>(tag: K, str: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.textContent = str;
  return el;
}

/** One shared dialog, with no authority of its own: a backend must confirm any write. */
export function mountRecordCorrection(backend: CorrectionBackend, label: string): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal-box game-dialog record-correction';
  dialog.setAttribute('aria-labelledby', 'record-correction-heading');
  dialog.innerHTML = `
    <div class="dialog-heading"><h2 id="record-correction-heading">このブラウザの記録を見直す</h2></div>
    <p class="dialog-caption" id="record-correction-label"></p>
    <p class="record-correction-intro">直近24時間の記録を、難易度ごとに確認できます。外した記録も、プレイから24時間以内なら集計に戻せます。</p>
    <p class="record-correction-tip"><strong>ヒント：</strong>友達が遊んだ記録だけ選んで「集計から外す」。自分の記録が混じっていたらチェックを外せます。</p>
    <div class="record-correction-tabs" role="group" aria-label="表示する難易度"></div>
    <p class="record-correction-count" aria-live="polite"></p>
    <div class="record-correction-range" hidden>
      <label>ここから <select data-correction-first></select></label>
      <label>ここまで <select data-correction-last></select></label>
      <button type="button" class="plate-btn compact-btn" data-correction-range>範囲を選ぶ</button>
      <button type="button" class="plate-btn compact-btn" data-correction-clear>この難易度の選択を解除</button>
    </div>
    <div class="record-correction-list" role="group" aria-label="選択中の難易度のプレイ履歴"></div>
    <button type="button" class="plate-btn compact-btn record-correction-more" data-correction-more hidden>さらに表示</button>
    <div class="record-correction-preview" aria-live="polite"></div>
    <p role="status" class="record-correction-status"></p>
    <div class="consent-actions">
      <button type="button" class="plate-btn compact-btn" data-correction-close>閉じる</button>
      <button type="button" class="plate-btn compact-btn" data-correction-preview="false" disabled>集計に戻す</button>
      <button type="button" class="plate-btn plate-btn-hot compact-btn" data-correction-preview="true" disabled>集計から外す</button>
    </div>`;
  document.body.append(dialog);
  const get = <T extends HTMLElement = HTMLElement>(q: string): T => dialog.querySelector<T>(q)!;
  const list = get('.record-correction-list');
  const range = get('.record-correction-range');
  const stages = get('.record-correction-tabs');
  const count = get('.record-correction-count');
  const more = get<HTMLButtonElement>('[data-correction-more]');
  const preview = get('.record-correction-preview');
  const status = get('.record-correction-status');
  const first = get<HTMLSelectElement>('[data-correction-first]');
  const last = get<HTMLSelectElement>('[data-correction-last]');
  const close = get<HTMLButtonElement>('[data-correction-close]');
  const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-correction-preview]'));
  get('#record-correction-label').textContent = label;

  let generation = 0;
  let busy = false;
  let snapshot: CorrectionSnapshot | null = null;
  let stage: CorrectableDifficulty = 'easy';
  const limits = new Map<CorrectableDifficulty, number>();
  const stageRows = () => snapshot ? correctionRuns(snapshot).filter(run => run.difficulty === stage) : [];
  const visibleRows = () => stageRows().slice(0, limits.get(stage) ?? ROWS_AT_A_TIME);
  let selected = new Set<string>();
  let opener: HTMLElement | null = null;
  let previousCheckbox: string | null = null;

  const updateSelection = () => {
    const current = snapshot;
    const runs = current ? correctionRuns(current) : [];
    const currentRows = runs.filter(run => run.difficulty === stage);
    const totalShown = Math.min(currentRows.length, limits.get(stage) ?? ROWS_AT_A_TIME);
    const stageCount = currentRows.filter(run => selected.has(run.id)).length;
    more.hidden = !current || totalShown >= currentRows.length;
    more.disabled = busy;
    count.textContent = current
      ? `${DIFFICULTY_LABELS[stage]} ${currentRows.length}件${totalShown < currentRows.length ? `（${totalShown}件を表示）` : ''}｜この難易度で${stageCount}件、全難易度で${selected.size}件選択中`
      : '';
    for (const tab of stages.querySelectorAll<HTMLButtonElement>('button')) {
      const id = tab.dataset.stage as CorrectableDifficulty;
      const rows = runs.filter(run => run.difficulty === id);
      const marked = rows.filter(run => selected.has(run.id)).length;
      tab.disabled = busy;
      tab.setAttribute('aria-pressed', String(id === stage));
      tab.textContent = `${DIFFICULTY_LABELS[id]} ${rows.length}件${marked ? `（選択${marked}）` : ''}`;
    }
    for (const button of controls) button.disabled = busy || !current ||
      correctionChanges(current, selected, button.dataset.correctionPreview === 'true').length === 0;
    list.querySelectorAll<HTMLInputElement>('input').forEach(input => {
      input.checked = selected.has(input.value);
      input.disabled = busy;
    });
    range.querySelectorAll('button, select').forEach(control => (control as HTMLButtonElement | HTMLSelectElement).disabled = busy);
  };
  const clearPreview = () => preview.replaceChildren();

  function renderRows() {
    if (!snapshot) return;
    const rows = visibleRows();
    list.replaceChildren();
    first.replaceChildren();
    last.replaceChildren();
    range.hidden = rows.length < 2;
    if (!rows.length) list.append(setText('p', 'この難易度に、直近24時間の記録はありません。'));
    for (const run of rows) {
      const when = dateTime.format(run.playedAt);
      const value = formatValue(run.difficulty, run.value);
      for (const select of [first, last]) {
        const option = new Option(`${when}｜${value}`, run.id);
        select.add(option);
      }
      const label = document.createElement('label');
      label.className = 'record-correction-entry';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = run.id;
      checkbox.addEventListener('click', event => {
        const enabled = checkbox.checked;
        const ids = event.shiftKey && previousCheckbox
          ? correctionRange(rows, previousCheckbox, run.id) : [run.id];
        previousCheckbox = run.id;
        for (const id of ids) {
          if (enabled) selected.add(id); else selected.delete(id);
        }
        clearPreview();
        updateSelection();
      });
      const meta = setText('span', when);
      const points = setText('strong', value);
      if (run.excluded) {
        const badge = setText('small', '集計から除外中');
        badge.className = 'record-correction-excluded';
        meta.append(badge);
      }
      label.append(checkbox, meta, points);
      list.append(label);
    }
    updateSelection();
  }

  more.onclick = () => {
    const previouslyShown = visibleRows().length;
    limits.set(stage, previouslyShown + ROWS_AT_A_TIME);
    renderRows();
    list.querySelectorAll<HTMLInputElement>('input')[previouslyShown]?.focus();
  };
  const applyRange = () => {
    if (snapshot) {
      for (const id of correctionRange(visibleRows(), first.value, last.value)) selected.add(id);
      clearPreview();
      updateSelection();
    }
  };
  get<HTMLButtonElement>('[data-correction-range]').onclick = applyRange;
  get<HTMLButtonElement>('[data-correction-clear]').onclick = () => {
    for (const run of stageRows()) selected.delete(run.id);
    previousCheckbox = null; clearPreview(); updateSelection();
  };
  close.onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    generation++;
    snapshot = null;
    selected.clear();
    list.replaceChildren();
    first.replaceChildren();
    last.replaceChildren();
    stages.replaceChildren();
    count.textContent = '';
    clearPreview();
    if (opener?.isConnected) opener.focus();
  });

  for (const control of controls) {
    control.onclick = async () => {
      if (!snapshot || busy) return;
      const attempt = generation;
      const excluded = control.dataset.correctionPreview === 'true';
      const changes = correctionChanges(snapshot, selected, excluded);
      if (!changes.length) return;
      const revision = snapshot.revision;
      clearPreview();
      let summary = previewCorrection(snapshot, changes);
      if (backend.preview) {
        busy = close.disabled = true;
        updateSelection();
        status.textContent = '変更後の記録を確認中…';
        try {
          summary = [...await backend.preview(revision, changes)];
          if (generation !== attempt || !dialog.open) return;
          status.textContent = '';
        } catch {
          if (generation === attempt && dialog.open) {
            status.textContent = '記録が変わったか、確認できませんでした。閉じて読み直してください。';
            snapshot = null;
            list.replaceChildren();
            range.hidden = true;
            stages.replaceChildren();
          }
          return;
        } finally {
          if (generation === attempt) {
            busy = close.disabled = false;
            updateSelection();
          }
        }
      }
      preview.append(setText('h3', `${changes.length}件を${excluded ? '集計から外す' : '集計に戻す'}`));
      const lines = document.createElement('ul');
      for (const item of summary) {
        lines.append(setText('li', `${DIFFICULTY_LABELS[item.difficulty]}：${formatValue(item.difficulty, item.before)} → ${formatValue(item.difficulty, item.after)}`));
      }
      const confirm = setText('button', 'この内容で確定');
      confirm.type = 'button';
      confirm.className = 'plate-btn plate-btn-hot compact-btn';
      preview.append(lines, confirm);
      confirm.onclick = async () => {
        if (busy || generation !== attempt || !confirm.isConnected) return;
        busy = true;
        confirm.disabled = close.disabled = true;
        updateSelection();
        try {
          const next = await backend.apply(revision, changes);
          if (generation !== attempt || !dialog.open) return;
          snapshot = next;
          selected = new Set();
          previousCheckbox = null;
          clearPreview();
          status.textContent = '反映しました。';
          renderRows();
        } catch {
          if (generation !== attempt || !dialog.open) return;
          // Stale or unauthorised snapshots cannot be confirmed again.
          clearPreview();
          selected.clear();
          previousCheckbox = null;
          status.textContent = '変更の反映を確認できませんでした。閉じて記録を読み直してください。';
          snapshot = null;
          list.replaceChildren();
          range.hidden = true;
          stages.replaceChildren();
        } finally {
          if (generation === attempt) {
            busy = false;
            close.disabled = false;
            updateSelection();
          }
        }
      };
      confirm.focus();
    };
  }

  const open = async (source: HTMLElement) => {
    if (dialog.open) return;
    opener = source;
    const attempt = ++generation;
    busy = false;
    snapshot = null;
    selected = new Set();
    previousCheckbox = null;
    range.hidden = true;
    more.hidden = true;
    limits.clear();
    close.disabled = false;
    status.textContent = '記録を読み込み中…';
    updateSelection();
    dialog.showModal();
    close.focus();
    try {
      const loaded = await backend.load();
      if (generation !== attempt || !dialog.open) return;
      snapshot = loaded;
      stage = correctionRuns(loaded)[0]?.difficulty ?? 'easy';
      for (const id of CORRECTABLE_DIFFICULTIES) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'plate-btn compact-btn';
        tab.dataset.stage = id;
        tab.onclick = () => {
          if (stage === id) return;
          stage = id;
          previousCheckbox = null;
          clearPreview();
          renderRows();
        };
        stages.append(tab);
      }
      status.textContent = '';
      renderRows();
    } catch {
      if (generation === attempt && dialog.open) status.textContent = 'このブラウザの記録を読み込めませんでした。通常どおりプレイできます。';
    }
  };

  const destinations = [
    ['#modal-ranking .modal-actions', 'このブラウザの記録を見直す'],
    ['#modal-settings .modal-actions', 'このブラウザの記録を見直す'],
    ['#account-dialog .account-footer', 'このブラウザの記録を見直す'],
    ['#personal-best-result', '記録を見直す'],
  ];
  for (const [selector, title] of destinations) {
    const container = document.querySelector(selector);
    if (!container) continue;
    const button = setText('button', title);
    button.type = 'button';
    button.className = 'plate-btn compact-btn record-correction-entry-point';
    button.onclick = () => { void open(button); };
    container.prepend(button);
  }
}
