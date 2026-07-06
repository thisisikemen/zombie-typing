/**
 * DOM オーバーレイの画面管理(タイトル / モード選択 / リザルト /
 * ポーズ / 設定・遊び方モーダル)。
 * 金属プレート等の UI 画像は public/assets/ui/ のものを CSS 変数経由で使う。
 */

import { MODES, type DifficultyDef, type ModeDef, type RankMetric } from '../core/modes';
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
  rankBy: RankMetric;
  /** ランキング登録の対象か(ベーシックは false) */
  ranked: boolean;
  endless: boolean;
  /** ベーシック(練習)か。「終了する」で抜けた場合は SCORE 見出しになる */
  practice: boolean;
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
  /** ボタン押下音(bolt=ナビゲーション / ready=ゲーム開始系 / shell=ランキング / select=カルーセル矢印) */
  onUiSound(kind: 'bolt' | 'ready' | 'shell' | 'select'): void;
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
  /** カルーセルの左端カード位置(難易度が 4 つ以上のモード用) */
  private carouselOffset = 1;
  /** 直近のリザルトで自動登録された順位 */
  private lastRank: number | null = null;
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
      cb.onUiSound('shell'); // 薬莢の音
      this.openRanking();
    };
    $('btn-ranking-close').onclick = () => this.closeModals();

    // 名前変更(結果 / 設定 / ランキングの3箇所から。入力は同期される)
    const resultName = $<HTMLInputElement>('result-name');
    resultName.value = loadPlayerName();
    resultName.addEventListener('keydown', (e) => {
      e.stopPropagation(); // ゲーム側のキー処理(Rリスタート等)に流さない
      if (e.key === 'Enter') void this.applyRename(resultName.value, 'result');
    });
    $('btn-register').onclick = () => void this.applyRename(resultName.value, 'result');

    const setName = $<HTMLInputElement>('set-name');
    setName.value = loadPlayerName();
    setName.addEventListener('keydown', (e) => e.stopPropagation());
    setName.addEventListener('change', () => void this.applyRename(setName.value, 'settings'));

    const rankingName = $<HTMLInputElement>('ranking-name');
    rankingName.value = loadPlayerName();
    rankingName.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.applyRename(rankingName.value, 'ranking');
    });
    $('btn-ranking-rename').onclick = () => void this.applyRename(rankingName.value, 'ranking');

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

  /** ポーズの離脱ボタン: 練習(ベーシック)は「終了する」、それ以外は「あきらめる」 */
  setPauseQuitLabel(practice: boolean): void {
    $('btn-giveup').textContent = practice ? '終了する' : 'あきらめる';
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
    $<HTMLInputElement>('ranking-name').value = loadPlayerName();
    this.rankingModal.classList.remove('hidden');
    this.renderRanking();
  }

  private renderRanking(): void {
    const tabs = $('ranking-tabs');
    tabs.innerHTML = '';
    // ランキング対象の難易度だけタブに出す(ベーシックは対象外)
    const rankedDiffs = this.activeMode.difficulties.filter((diff) => diff.ranked !== false);
    if (!rankedDiffs.some((diff) => diff.id === this.rankingDiff)) {
      this.rankingDiff = rankedDiffs[0]?.id ?? this.rankingDiff;
    }
    for (const diff of rankedDiffs) {
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

    const activeDiff = rankedDiffs.find((diff) => diff.id === this.rankingDiff);
    const metric = activeDiff?.rankBy ?? 'score';

    $('ranking-note').textContent = rankingBackend.online
      ? metric === 'survival'
        ? '世界ランキング(生存時間・上位100位)'
        : '世界ランキング(上位100位)'
      : 'この端末内のランキングです(オンラインランキングは準備中)';

    const list = $('ranking-list');
    list.innerHTML = '<li class="ranking-empty">読み込み中…</li>';
    const requested = this.rankingDiff;
    rankingBackend
      .load(requested, metric)
      .then((entries) => {
        if (this.rankingDiff !== requested) return; // タブが切り替わっていたら破棄
        if (entries.length === 0) {
          list.innerHTML = '<li class="ranking-empty">まだ記録がありません。最初の生存者になろう。</li>';
          return;
        }
        list.innerHTML = entries
          .map((e, i) => {
            const main = metric === 'survival' ? formatTime(e.survival) : e.score.toLocaleString();
            const sub =
              metric === 'survival'
                ? `スコア ${e.score.toLocaleString()}・撃破 ${e.kills}・WPM ${e.wpm}`
                : `撃破 ${e.kills}・WPM ${e.wpm}・${(e.accuracy * 100).toFixed(1)}%`;
            return `
        <li class="ranking-row${i < 3 ? ` top${i + 1}` : ''}">
          <span class="rk-pos">${i + 1}</span>
          <span class="rk-main"><span class="rk-name">${escapeHtml(e.name)}</span>
            <span class="rk-sub">${sub}</span></span>
          <span class="rk-score">${main}</span>
        </li>`;
          })
          .join('');
      })
      .catch(() => {
        list.innerHTML = '<li class="ranking-empty">読み込みに失敗しました。</li>';
      });
  }


  /** モードタブ + 難易度カード(モード追加時はタブが増える・仕様 §11) */
  buildModeSelect(): void {
    const tabs = $('mode-tabs');
    tabs.innerHTML = '';
    for (const mode of MODES) {
      const tab = document.createElement('button');
      tab.className = `mode-tab${mode.id === this.activeMode.id ? ' active' : ''}`;
      tab.setAttribute('aria-label', mode.label);
      const img = document.createElement('img');
      // モードごとのタブ画像(dawn=夜明けまで / endless=夜は明けない)
      img.src = `${import.meta.env.BASE_URL}assets/ui/${mode.id === 'endless' ? 'tab-endless.png' : 'tab-active.png'}`;
      img.alt = mode.label;
      tab.appendChild(img);
      tab.onclick = () => {
        this.cb.onUiSound('bolt');
        this.activeMode = mode;
        this.carouselOffset = mode.difficulties.length > 3 ? 1 : 0;
        this.buildModeSelect();
      };
      tabs.appendChild(tab);
    }
    // 近日公開の空きスロット(合計3枠になるように補う)
    for (let i = 0; i < Math.max(0, 3 - MODES.length); i++) {
      const locked = document.createElement('div');
      locked.className = 'mode-tab locked';
      const img = document.createElement('img');
      img.src = `${import.meta.env.BASE_URL}assets/ui/tab-locked.png`;
      img.alt = '近日公開';
      locked.appendChild(img);
      tabs.appendChild(locked);
    }

    const cardsHost = $('difficulty-cards');
    cardsHost.innerHTML = '';
    const diffs = this.activeMode.difficulties;
    cardsHost.classList.toggle('single', diffs.length === 1);
    const carousel = diffs.length > 3;
    cardsHost.classList.toggle('carousel', carousel);

    const buildCard = (diff: DifficultyDef): HTMLButtonElement => {
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
        diff.durationHint ??
        (mm > 0 ? `${mm}分${ss > 0 ? `${ss}秒` : ''}` : `${diff.duration}秒`);
      const bestText =
        diff.ranked === false
          ? '<span class="unranked-note">※ランキング対象外</span>'
          : best && diff.rankBy === 'survival'
            ? `最長 ${formatTime(best.survival ?? 0)}`
            : best
              ? `ベスト ${best.score.toLocaleString()}`
              : '';
      card.innerHTML = `
        <h3>${diff.label}</h3>
        <ul class="diff-specs">
          <li>単語: <span class="num">${diff.wordHint}</span></li>
          <li>${diff.zombieHint}</li>
          <li>${diff.endless ? '条件' : diff.practice ? '時間' : '夜明けまで'} <span class="num">${durText}</span></li>
        </ul>
        <div class="diff-best">${bestText}</div>
      `;
      card.onclick = () => {
        if (performance.now() - this.shownAt < 300) return; // すり抜けクリック防止
        this.cb.onSelectDifficulty(this.activeMode, diff);
      };
      return card;
    };

    if (!carousel) {
      for (const diff of diffs) cardsHost.appendChild(buildCard(diff));
      return;
    }

    // 5 枚などはカルーセル: 中央に 3 枚、左右は半分見切れ+半透明で気配を見せる
    const maxOffset = diffs.length - 3;
    this.carouselOffset = Math.max(0, Math.min(maxOffset, this.carouselOffset));

    const viewport = document.createElement('div');
    viewport.className = 'carousel-viewport';
    const track = document.createElement('div');
    track.className = 'carousel-track';
    const cardEls = diffs.map((diff) => {
      const el = buildCard(diff);
      track.appendChild(el);
      return el;
    });
    viewport.appendChild(track);

    const arrowL = document.createElement('button');
    arrowL.className = 'carousel-arrow left';
    arrowL.innerHTML = '&#9664;';
    arrowL.setAttribute('aria-label', '前の難易度');
    const arrowR = document.createElement('button');
    arrowR.className = 'carousel-arrow right';
    arrowR.innerHTML = '&#9654;';
    arrowR.setAttribute('aria-label', '次の難易度');

    const apply = () => {
      track.style.transform = `translateX(calc(var(--peek) - ${this.carouselOffset} * var(--card-step)))`;
      cardEls.forEach((el, i) => {
        const visible = i >= this.carouselOffset && i < this.carouselOffset + 3;
        el.classList.toggle('peek', !visible);
      });
      arrowL.disabled = this.carouselOffset <= 0;
      arrowR.disabled = this.carouselOffset >= maxOffset;
    };
    arrowL.onclick = () => {
      if (this.carouselOffset > 0) {
        this.cb.onUiSound('select');
        this.carouselOffset--;
        apply();
      }
    };
    arrowR.onclick = () => {
      if (this.carouselOffset < maxOffset) {
        this.cb.onUiSound('select');
        this.carouselOffset++;
        apply();
      }
    };

    cardsHost.appendChild(arrowL);
    cardsHost.appendChild(viewport);
    cardsHost.appendChild(arrowR);
    apply();
  }

  /** 数字キーでの難易度選択(カルーセル時は見えている 3 枚に対応) */
  selectDifficultyByIndex(idx: number): boolean {
    const base = this.activeMode.difficulties.length > 3 ? this.carouselOffset : 0;
    const diff = this.activeMode.difficulties[base + idx];
    if (!diff) return false;
    this.cb.onSelectDifficulty(this.activeMode, diff);
    return true;
  }

  showResult(data: ResultData): void {
    this.shareData = data;

    // ベーシックを「終了する」で抜けた場合はクリアでもゲームオーバーでもなく SCORE
    const practiceScore = data.practice && data.cleared;

    // モードに応じたキーアートを背景に
    const screen = this.screens.result;
    if (data.endless) {
      screen.style.backgroundImage = uiUrl('result-endless-bg.png');
    } else if (data.cleared) {
      screen.style.backgroundImage = uiUrl('result-clear-bg.jpg');
    } else {
      screen.style.backgroundImage = 'none';
    }

    $('result-sub').textContent = practiceScore
      ? '練習おつかれさま!'
      : data.endless
        ? '夜はまだ終わらない…'
        : data.cleared
          ? '夜明けまで生き延びた!'
          : '防衛ラインは破られた…';
    const heading = $('result-heading');
    heading.textContent = practiceScore ? 'SCORE' : data.cleared ? 'CLEAR' : 'GAME OVER';
    heading.className = data.cleared ? 'clear' : 'gameover';

    const rows: [string, string, string][] =
      data.rankBy === 'survival'
        ? [
            ['生存時間', formatTime(data.survival), 'gold'],
            ['スコア', data.score.toLocaleString(), ''],
            ['撃破数', `${data.kills}<span class="unit">体</span>`, ''],
            ['正確率', `${(data.accuracy * 100).toFixed(1)}<span class="unit">%</span>`, ''],
            ['ミスタイプ', `${data.misses}<span class="unit">回</span>`, ''],
            [
              '最大コンボ <span class="label-note">(ノーミスでの連続撃破数)</span>',
              `${data.maxCombo}`,
              '',
            ],
            ['WPM <span class="label-note">(1分あたりの正打数)</span>', `${data.wpm}`, ''],
          ]
        : [
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

    // ランキングへ自動登録(登録し忘れ防止)。ランキング対象外の難易度では出さない
    const register = $('result-register');
    const metricValue = data.rankBy === 'survival' ? data.survival : data.score;
    const canRegister = data.ranked && metricValue > 0;
    register.style.display = canRegister ? '' : 'none';
    $('register-status').textContent = '';
    const nameInput = $<HTMLInputElement>('result-name');
    nameInput.value = loadPlayerName();
    this.lastRank = null;
    if (canRegister) {
      const name = sanitizeName(loadPlayerName());
      $('register-status').textContent = 'ランキングに登録中…';
      const entry: RankEntry = {
        name,
        score: data.score,
        kills: data.kills,
        wpm: data.wpm,
        accuracy: data.accuracy,
        survival: Math.round(data.survival),
        ts: Date.now(),
      };
      rankingBackend
        .submit(data.diffId, entry, data.rankBy)
        .then((rank) => {
          this.lastRank = rank;
          this.setRegisterStatus(name);
        })
        .catch(() => {
          $('register-status').textContent = 'ランキング登録に失敗しました';
        });
    }

    this.show('result');
  }

  private setRegisterStatus(name: string): void {
    const where = rankingBackend.online ? '世界' : 'この端末で';
    $('register-status').textContent =
      this.lastRank !== null
        ? `${where} ${this.lastRank}位 にランクイン!(${name})`
        : '';
  }

  /** 名前を変更して各所へ反映(登録済みスコアの名前も更新される) */
  private async applyRename(raw: string, source: 'result' | 'settings' | 'ranking'): Promise<void> {
    const name = sanitizeName(raw);
    savePlayerName(name);
    for (const id of ['result-name', 'set-name', 'ranking-name']) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = name;
    }
    try {
      await rankingBackend.rename(name);
      if (source === 'ranking') this.renderRanking();
      if (source === 'result') this.setRegisterStatus(name);
    } catch {
      /* オンライン側の改名失敗は致命的ではない */
    }
  }

  private share(): void {
    if (!this.shareData) return;
    const d = this.shareData;
    const outcome = d.endless
      ? `${formatTime(d.survival)}生き延びた`
      : d.cleared
        ? '夜明けまで生き延びた!'
        : '力尽きた…';
    const text =
      `【ゾンビタイピング】${d.modeLabel}(${d.diffLabel})で${outcome}` +
      ` スコア${d.score.toLocaleString()} / 撃破${d.kills}体 / 正確率${(d.accuracy * 100).toFixed(1)}% / WPM ${d.wpm} / 最大コンボ${d.maxCombo}`;
    const url = new URL('https://twitter.com/intent/tweet');
    url.searchParams.set('text', text);
    url.searchParams.set('hashtags', 'ゾンビタイピング');
    // 公開サイトの URL(クエリ等は除く)
    url.searchParams.set('url', `${location.origin}${location.pathname}`);
    window.open(url.toString(), '_blank', 'noopener');
  }
}
