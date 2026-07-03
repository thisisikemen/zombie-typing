/**
 * DOM オーバーレイの画面管理(タイトル / モード選択 / リザルト /
 * ポーズ / 設定・遊び方モーダル)。
 * 金属プレート等の UI 画像は public/assets/ui/ のものを CSS 変数経由で使う。
 */

import { MODES, type DifficultyDef, type ModeDef } from '../core/modes';
import {
  loadPlayerName,
  rankingBackend,
  sanitizeName,
  savePlayerName,
  type RankEntry,
} from './ranking';
import { loadBest, type Settings } from './store';
import { TIPS } from './tips';

export type ScreenName = 'title' | 'mode' | 'result' | 'pause' | 'none';

export interface ResultData {
  cleared: boolean;
  score: number;
  kills: number;
  accuracy: number; // 0〜1
  misses: number;
  maxCombo: number;
  wpm: number;
  survival: number; // 秒
  modeLabel: string;
  diffId: string;
  diffLabel: string;
  newRecord: boolean;
}

export interface UICallbacks {
  onStart(): void;
  onSelectDifficulty(mode: ModeDef, diff: DifficultyDef): void;
  onBackToTitle(): void;
  onRetry(): void;
  onGotoModeSelect(): void;
  onResume(): void;
  onGiveUp(): void;
  onSettingsChanged(s: Settings): void;
  /** 何らかのユーザー操作(AudioContext の初期化トリガ) */
  onUserGesture(): void;
  /** ボタン押下音(bolt=ナビゲーション / ready=ゲーム開始系) */
  onUiSound(kind: 'bolt' | 'ready'): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: #${id}`);
  return el as T;
};

/**
 * UI 画像の CSS url() を絶対 URL で作る。
 * 相対 URL のままだと、CSS 変数経由で使ったときに「ビルド後の CSS ファイルの
 * 場所」基準で解決されて本番(サブパス配信)で 404 になるため、
 * 必ずページ基準の絶対 URL に変換する。
 */
const uiUrl = (name: string) =>
  `url("${new URL(`${import.meta.env.BASE_URL}assets/ui/${name}`, document.baseURI).href}")`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function formatTime(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export class UI {
  private screens: Record<Exclude<ScreenName, 'none'>, HTMLElement> = {
    title: $('screen-title'),
    mode: $('screen-mode'),
    result: $('screen-result'),
    pause: $('screen-pause'),
  };
  private settingsModal = $('modal-settings');
  private howtoModal = $('modal-howto');
  private rankingModal = $('modal-ranking');
  private shareData: ResultData | null = null;
  /** ランキングモーダルで表示中の難易度 */
  private rankingDiff = 'normal';
  private activeMode: ModeDef = MODES[0];
  /** 画面切替直後の誤クリック(ダブルクリック等のすり抜け)防止 */
  private shownAt = 0;
  /** アドバイスメッセージの山札(使い切ったらシャッフルし直す) */
  private tipsDeck: string[] = [];
  private tipsIndex = 0;

  constructor(
    private settings: Settings,
    private readonly cb: UICallbacks,
  ) {
    // 金属プレートのボタン画像を CSS 変数へ
    const root = document.documentElement.style;
    root.setProperty('--ui-btn', uiUrl('btn.png'));
    root.setProperty('--ui-btn-active', uiUrl('btn-active.png'));

    // どのクリックもオーディオ初期化のトリガにする
    document.addEventListener('pointerdown', () => cb.onUserGesture(), { capture: true });

    $('btn-start').onclick = () => cb.onStart();
    $('btn-howto').onclick = () => {
      cb.onUiSound('bolt');
      this.openHowto();
    };
    $('btn-settings').onclick = () => {
      cb.onUiSound('bolt');
      this.openSettings();
    };
    $('btn-mode-back').onclick = () => cb.onBackToTitle();
    $('btn-mode-settings').onclick = () => {
      cb.onUiSound('bolt');
      this.openSettings();
    };
    $('btn-retry').onclick = () => cb.onRetry();
    $('btn-result-mode').onclick = () => cb.onGotoModeSelect();
    $('btn-result-title').onclick = () => cb.onBackToTitle();
    $('btn-share').onclick = () => this.share();
    $('btn-resume').onclick = () => cb.onResume();
    $('btn-giveup').onclick = () => cb.onGiveUp();
    $('btn-settings-close').onclick = () => this.closeModals();
    $('btn-howto-close').onclick = () => this.closeModals();

    // ランキング
    $('btn-ranking').onclick = () => {
      cb.onUiSound('bolt');
      this.openRanking();
    };
    $('btn-ranking-close').onclick = () => this.closeModals();
    $('btn-register').onclick = () => void this.registerScore();
    const nameInput = $<HTMLInputElement>('result-name');
    nameInput.value = loadPlayerName();
    nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // ゲーム側のキー処理(Rリスタート等)に流さない
      if (e.key === 'Enter') void this.registerScore();
    });

    const vol = $<HTMLInputElement>('set-volume');
    const sfx = $<HTMLInputElement>('set-sfx');
    const bgm = $<HTMLInputElement>('set-bgm');
    const romaji = $<HTMLInputElement>('set-romaji');
    vol.value = String(Math.round(settings.volume * 100));
    sfx.checked = settings.sfx;
    bgm.checked = settings.bgm;
    romaji.checked = settings.romaji;
    const emit = () => {
      this.settings = {
        volume: Number(vol.value) / 100,
        sfx: sfx.checked,
        bgm: bgm.checked,
        romaji: romaji.checked,
      };
      cb.onSettingsChanged(this.settings);
    };
    vol.oninput = emit;
    sfx.onchange = emit;
    bgm.onchange = emit;
    romaji.onchange = emit;

    this.buildModeSelect();
    this.startTips();
  }

  /** アドバイスメッセージのローテーション(タイトル/モード選択の下部) */
  private startTips(): void {
    const els = [document.getElementById('tips-title'), document.getElementById('tips-mode')]
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const shuffle = () => {
      this.tipsDeck = [...TIPS].sort(() => Math.random() - 0.5);
      this.tipsIndex = 0;
    };
    const next = () => {
      if (this.tipsIndex >= this.tipsDeck.length) shuffle();
      return this.tipsDeck[this.tipsIndex++];
    };
    shuffle();
    const first = next();
    for (const el of els) el.textContent = first;
    setInterval(() => {
      const tip = next();
      for (const el of els) {
        el.style.opacity = '0';
        setTimeout(() => {
          el.textContent = tip;
          el.style.opacity = '1';
        }, 350);
      }
    }, 6500);
  }

  show(name: ScreenName): void {
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('hidden', key !== name);
    }
    this.shownAt = performance.now();
    // ボタンにフォーカスが残ると Enter/Space が誤爆するため外す
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  isModalOpen(): boolean {
    return (
      !this.settingsModal.classList.contains('hidden') ||
      !this.howtoModal.classList.contains('hidden') ||
      !this.rankingModal.classList.contains('hidden')
    );
  }

  openSettings(): void {
    this.settingsModal.classList.remove('hidden');
  }

  openHowto(): void {
    this.howtoModal.classList.remove('hidden');
  }

  closeModals(): void {
    this.settingsModal.classList.add('hidden');
    this.howtoModal.classList.add('hidden');
    this.rankingModal.classList.add('hidden');
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  // ---------- ランキング ----------

  openRanking(diffId?: string): void {
    if (diffId) this.rankingDiff = diffId;
    this.rankingModal.classList.remove('hidden');
    this.renderRanking();
  }

  private renderRanking(): void {
    const tabs = $('ranking-tabs');
    tabs.innerHTML = '';
    for (const diff of this.activeMode.difficulties) {
      const tab = document.createElement('button');
      tab.className = `ranking-tab${diff.id === this.rankingDiff ? ' active' : ''}`;
      tab.textContent = diff.label;
      tab.style.setProperty('--tab-color', diff.color);
      tab.onclick = () => {
        this.rankingDiff = diff.id;
        this.renderRanking();
      };
      tabs.appendChild(tab);
    }

    $('ranking-note').textContent = rankingBackend.online
      ? '世界ランキング(上位100位)'
      : 'この端末内のランキングです(オンラインランキングは準備中)';

    const list = $('ranking-list');
    list.innerHTML = '<li class="ranking-empty">読み込み中…</li>';
    const requested = this.rankingDiff;
    rankingBackend
      .load(requested)
      .then((entries) => {
        if (this.rankingDiff !== requested) return; // タブが切り替わっていたら破棄
        if (entries.length === 0) {
          list.innerHTML = '<li class="ranking-empty">まだ記録がありません。最初の生存者になろう。</li>';
          return;
        }
        list.innerHTML = entries
          .map(
            (e, i) => `
        <li class="ranking-row${i < 3 ? ` top${i + 1}` : ''}">
          <span class="rk-pos">${i + 1}</span>
          <span class="rk-main"><span class="rk-name">${escapeHtml(e.name)}</span>
            <span class="rk-sub">撃破 ${e.kills}・WPM ${e.wpm}・${(e.accuracy * 100).toFixed(1)}%</span></span>
          <span class="rk-score">${e.score.toLocaleString()}</span>
        </li>`,
          )
          .join('');
      })
      .catch(() => {
        list.innerHTML = '<li class="ranking-empty">読み込みに失敗しました。</li>';
      });
  }

  private async registerScore(): Promise<void> {
    const d = this.shareData;
    if (!d || d.score <= 0) return;
    const btn = $<HTMLButtonElement>('btn-register');
    if (btn.disabled) return;
    const name = sanitizeName($<HTMLInputElement>('result-name').value);
    savePlayerName(name);
    btn.disabled = true;
    btn.textContent = '登録中…';
    const entry: RankEntry = {
      name,
      score: d.score,
      kills: d.kills,
      wpm: d.wpm,
      accuracy: d.accuracy,
      ts: Date.now(),
    };
    try {
      const rank = await rankingBackend.submit(d.diffId, entry);
      btn.textContent = `登録しました(${rank}位)`;
    } catch {
      btn.textContent = '登録に失敗しました';
      btn.disabled = false;
    }
  }

  /** モードタブ + 難易度カード(モード追加時はタブが増える・仕様 §11) */
  buildModeSelect(): void {
    const tabs = $('mode-tabs');
    tabs.innerHTML = '';
    for (const mode of MODES) {
      const tab = document.createElement('button');
      tab.className = `mode-tab${mode.id === this.activeMode.id ? ' active' : ''}`;
      const img = document.createElement('img');
      // ※現状は「夜明けまで」のみ。モード追加時はモードごとのタブ画像を用意する
      img.src = `${import.meta.env.BASE_URL}assets/ui/tab-active.png`;
      img.alt = mode.label;
      tab.appendChild(img);
      tab.onclick = () => {
        this.cb.onUiSound('bolt');
        this.activeMode = mode;
        this.buildModeSelect();
      };
      tabs.appendChild(tab);
    }
    // 近日公開の空きスロット(イメージ準拠で2枠)
    for (let i = 0; i < 2; i++) {
      const locked = document.createElement('div');
      locked.className = 'mode-tab locked';
      const img = document.createElement('img');
      img.src = `${import.meta.env.BASE_URL}assets/ui/tab-locked.png`;
      img.alt = '近日公開';
      locked.appendChild(img);
      tabs.appendChild(locked);
    }

    const cards = $('difficulty-cards');
    cards.innerHTML = '';
    for (const diff of this.activeMode.difficulties) {
      const card = document.createElement('button');
      card.className = 'diff-card';
      card.style.setProperty('--card', uiUrl(`card-${diff.id}.png`));
      card.style.setProperty('--card-s', uiUrl(`card-${diff.id}-s.png`));
      card.style.setProperty('--card-color', diff.color);
      card.style.setProperty('--card-glow', `${diff.color}66`);
      const best = loadBest(this.activeMode.id, diff.id);
      const mm = Math.floor(diff.duration / 60);
      const ss = diff.duration % 60;
      const durText =
        mm > 0 ? `${mm}分${ss > 0 ? `${ss}秒` : ''}` : `${diff.duration}秒`;
      card.innerHTML = `
        <h3>${diff.label}</h3>
        <ul class="diff-specs">
          <li>単語: <span class="num">${diff.wordHint}</span></li>
          <li>${diff.zombieHint}</li>
          <li>夜明けまで <span class="num">${durText}</span></li>
        </ul>
        <div class="diff-best">${best ? `ベスト ${best.score.toLocaleString()}` : ''}</div>
      `;
      card.onclick = () => {
        if (performance.now() - this.shownAt < 300) return; // すり抜けクリック防止
        this.cb.onSelectDifficulty(this.activeMode, diff);
      };
      cards.appendChild(card);
    }
  }

  showResult(data: ResultData): void {
    this.shareData = data;

    // クリア時は朝焼けのキーアートを背景に
    const screen = this.screens.result;
    if (data.cleared) {
      screen.style.backgroundImage = uiUrl('result-clear-bg.jpg');
    } else {
      screen.style.backgroundImage = 'none';
    }

    $('result-sub').textContent = data.cleared
      ? '夜明けまで生き延びた!'
      : '防衛ラインは破られた…';
    const heading = $('result-heading');
    heading.textContent = data.cleared ? 'CLEAR' : 'GAME OVER';
    heading.className = data.cleared ? 'clear' : 'gameover';

    const rows: [string, string, string][] = [
      ['スコア', data.score.toLocaleString(), 'gold'],
      ['撃破数', `${data.kills}<span class="unit">体</span>`, ''],
      ['正確率', `${(data.accuracy * 100).toFixed(1)}<span class="unit">%</span>`, ''],
      ['ミスタイプ', `${data.misses}<span class="unit">回</span>`, ''],
      [
        '最大コンボ <span class="label-note">(ノーミスでの連続撃破数)</span>',
        `${data.maxCombo}`,
        '',
      ],
      ['WPM <span class="label-note">(1分あたりの正打数)</span>', `${data.wpm}`, ''],
      ['生存時間', formatTime(data.survival), ''],
    ];
    const stats = $('result-stats');
    stats.innerHTML = rows
      .map(
        ([label, value, cls]) =>
          `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value ${cls}">${value}</span></div>`,
      )
      .join('');
    if (data.newRecord) {
      stats.innerHTML += `<div class="result-new-record">NEW RECORD!</div>`;
    }

    // ランキング登録 UI をリセット
    const register = $('result-register');
    register.style.display = data.score > 0 ? '' : 'none';
    const btn = $<HTMLButtonElement>('btn-register');
    btn.disabled = false;
    btn.textContent = 'ランキングに登録';
    const nameInput = $<HTMLInputElement>('result-name');
    if (!nameInput.value) nameInput.value = loadPlayerName();

    this.show('result');
  }

  private share(): void {
    if (!this.shareData) return;
    const d = this.shareData;
    const text =
      `【ゾンビタイピング】${d.modeLabel}(${d.diffLabel})で` +
      (d.cleared ? '夜明けまで生き延びた!' : '力尽きた…') +
      ` スコア${d.score.toLocaleString()} / 撃破${d.kills}体 / 正確率${(d.accuracy * 100).toFixed(1)}% / WPM ${d.wpm} / 最大コンボ${d.maxCombo}`;
    const url = new URL('https://twitter.com/intent/tweet');
    url.searchParams.set('text', text);
    url.searchParams.set('hashtags', 'ゾンビタイピング');
    // 公開サイトの URL(クエリ等は除く)
    url.searchParams.set('url', `${location.origin}${location.pathname}`);
    window.open(url.toString(), '_blank', 'noopener');
  }
}
