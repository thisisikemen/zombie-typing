/**
 * エントリポイント。画面フロー(仕様 §12)の状態機械と rAF ループ。
 *   タイトル → モード選択 → カウントダウン → 本編 → リザルト
 * タイトル/モード選択の背景では自動デモプレイが流れる。
 */

import { AudioSystem, type SfxName } from './audio/sfx';
import { COUNTDOWN } from './config';
import { DemoBot } from './core/bot';
import { Game, type GameEvent } from './core/game';
import { MODES, type DifficultyDef, type ModeDef } from './core/modes';
import { WordPool } from './core/words';
import { initKeyboard } from './input/keyboard';
import { loadAssets } from './render/assets';
import { Renderer, type Scene } from './render/renderer';
import { UI } from './ui/screens';
import { loadSettings, saveBest, saveSettings, type Settings } from './ui/store';

type AppState =
  | 'loading'
  | 'title'
  | 'mode'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'ending'
  | 'result';

interface CountdownStep {
  text: string;
  dur: number;
  sfx: SfxName | null;
}

function countdownSteps(quick: boolean, endless = false): CountdownStep[] {
  const step = quick ? COUNTDOWN.stepTime * 0.65 : COUNTDOWN.stepTime;
  const steps: CountdownStep[] = [];
  if (!quick) {
    steps.push({ text: endless ? '終わらない夜…' : '日没…', dur: COUNTDOWN.introTime, sfx: null });
  }
  steps.push(
    { text: '3', dur: step, sfx: 'tick' },
    { text: '2', dur: step, sfx: 'tick' },
    { text: '1', dur: step, sfx: 'tick' },
  );
  return steps;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  // SEOティッカー: 静的HTMLには紹介文を1つだけ置き(検索エンジン向け)、
  // 表示上の継ぎ目ないループ用の複製はここで行う
  const tickerTrack = document.getElementById('ticker-track');
  if (tickerTrack && tickerTrack.children.length === 1) {
    const clone = tickerTrack.children[0].cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    tickerTrack.appendChild(clone);
  }

  const assets = await loadAssets();
  const renderer = new Renderer(canvas, assets);
  const audio = new AudioSystem();
  const pool = new WordPool();

  let settings: Settings = loadSettings();
  let state: AppState = 'loading';
  let game: Game | null = null;
  let demoGame: Game | null = null;
  let demoBot = new DemoBot();
  let currentMode: ModeDef = MODES[0];
  let currentDiff: DifficultyDef = MODES[0].difficulties[1];

  let cdSteps: CountdownStep[] = [];
  let cdIndex = 0;
  let cdTimer = 0;
  let goTimer = 0;
  let endFade: { kind: 'clear' | 'gameover'; t: number } | null = null;
  let endDelay = 0;

  const applyAudioSettings = () =>
    audio.applySettings({ volume: settings.volume, sfxOn: settings.sfx, bgmOn: settings.bgm });

  const userGesture = () => {
    void audio.ensureInit().then(applyAudioSettings);
  };

  // ---------- 状態遷移 ----------

  function newDemo(): void {
    demoGame = new Game(MODES[0].difficulties[1], pool);
    demoBot = new DemoBot();
  }

  function gotoTitle(): void {
    state = 'title';
    game = null;
    endFade = null;
    audio.play('bolt');
    audio.setBgm('menu'); // メニュー BGM(初回はユーザー操作後に自動開始)
    if (!demoGame) newDemo();
    ui.show('title');
  }

  function gotoModeSelect(): void {
    state = 'mode';
    game = null;
    endFade = null;
    audio.play('bolt');
    audio.setBgm('menu');
    if (!demoGame) newDemo();
    ui.buildModeSelect(); // ベストスコア表示を更新
    ui.show('mode');
  }

  function startGame(mode: ModeDef, diff: DifficultyDef, quick: boolean): void {
    currentMode = mode;
    currentDiff = diff;
    game = new Game(diff, pool);
    demoGame = null;
    endFade = null;
    goTimer = 0;
    renderer.resetForNewGame();
    cdSteps = countdownSteps(quick, diff.endless === true);
    cdIndex = 0;
    cdTimer = 0;
    state = 'countdown';
    ui.setPauseQuitLabel(diff.practice === true);
    ui.show('none');
    ui.closeModals();
    userGesture();
    void audio.ensureInit().then(() => {
      applyAudioSettings();
      audio.play('ready'); // 銃を構える
      // 戦闘 BGM はモード別。リザルトまで流れ続ける
      const bgm = diff.endless === true ? 'endless' : diff.id === 'hardcore' ? 'hardcore' : 'battle';
      audio.setBgm(bgm, true);
      if (cdSteps[0]?.sfx) audio.play(cdSteps[0].sfx);
    });
  }

  function beginPlay(): void {
    state = 'playing';
    goTimer = COUNTDOWN.goTime;
    audio.play('go');
  }

  function finishGame(kind: 'clear' | 'gameover'): void {
    state = 'ending';
    endFade = { kind, t: 0 };
    endDelay = kind === 'clear' ? 1.7 : 1.4;
    // 戦闘 BGM はリザルト画面まで流し続ける
    if (kind === 'gameover') audio.play('gameover');
  }

  function showResult(): void {
    if (!game) return;
    state = 'result';
    const cleared = game.status === 'clear';
    const survival = game.survivalTime();
    // WPM = 正打キー数 / 分(Eタイピング準拠)
    const wpm = survival > 0 ? Math.round(game.correctKeys / (survival / 60)) : 0;
    const newRecord = saveBest(
      currentMode.id,
      currentDiff.id,
      {
        score: game.score,
        kills: game.kills,
        maxCombo: game.maxCombo,
        accuracy: game.accuracy(),
        cleared,
        survival,
      },
      currentDiff.rankBy ?? 'score',
    );
    ui.showResult({
      cleared,
      score: game.score,
      kills: game.kills,
      accuracy: game.accuracy(),
      misses: game.missKeys,
      maxCombo: game.maxCombo,
      wpm,
      survival,
      modeLabel: currentMode.label,
      diffId: currentDiff.id,
      diffLabel: currentDiff.label,
      rankBy: currentDiff.rankBy ?? 'score',
      ranked: currentDiff.ranked !== false,
      endless: currentDiff.endless === true,
      practice: currentDiff.practice === true,
      newRecord,
    });
  }

  function giveUp(): void {
    if (!game) return;
    if (game.isPractice()) {
      // 練習の「終了する」はゲームオーバーではなく SCORE リザルトへ
      game.status = 'clear';
      ui.show('none');
      finishGame('clear');
      return;
    }
    // その場でゲームオーバー扱い
    game.hp = 0;
    game.status = 'gameover';
    ui.show('none');
    finishGame('gameover');
  }

  // ---------- UI ----------

  const ui = new UI(settings, {
    onStart: () => gotoModeSelect(),
    onSelectDifficulty: (mode, diff) => startGame(mode, diff, false),
    onBackToTitle: () => gotoTitle(),
    onRetry: () => startGame(currentMode, currentDiff, true),
    onGotoModeSelect: () => gotoModeSelect(),
    onResume: () => {
      if (state === 'paused') {
        audio.play('resume'); // ボルトリリース
        state = 'playing';
        ui.show('none');
      }
    },
    onGiveUp: () => giveUp(),
    onSettingsChanged: (s) => {
      settings = s;
      saveSettings(s);
      applyAudioSettings();
    },
    onUserGesture: userGesture,
    onUiSound: (kind) => audio.play(kind),
  });

  // ---------- キーボード ----------

  initKeyboard((action) => {
    userGesture();

    if (ui.isModalOpen()) {
      if (action.kind === 'escape' || action.kind === 'enter') ui.closeModals();
      return;
    }

    switch (state) {
      case 'title':
        if (action.kind === 'enter') gotoModeSelect();
        break;
      case 'mode':
        if (action.kind === 'escape') gotoTitle();
        if (action.kind === 'typing') {
          const idx = ['1', '2', '3'].indexOf(action.key);
          if (idx >= 0) ui.selectDifficultyByIndex(idx);
        }
        break;
      case 'countdown':
        if (action.kind === 'escape') gotoModeSelect();
        break;
      case 'playing':
        if (action.kind === 'typing') game?.handleKey(action.key);
        else if (action.kind === 'enter') game?.releaseTarget();
        else if (action.kind === 'escape') {
          audio.play('pause'); // 拳銃を構える
          state = 'paused';
          ui.show('pause');
        }
        break;
      case 'paused':
        if (action.kind === 'escape') {
          audio.play('resume'); // ボルトリリース
          state = 'playing';
          ui.show('none');
        }
        break;
      case 'result':
        if (action.kind === 'typing' && action.key === 'r') {
          ui.commitResultName(); // 名前入力が書き換え途中でも確定させる
          startGame(currentMode, currentDiff, true); // R で即リスタート(仕様 §12)
        } else if (action.kind === 'escape') {
          ui.commitResultName();
          gotoModeSelect();
        }
        break;
      default:
        break;
    }
  });

  // ---------- イベント → 音・演出 ----------

  // ゾンビ出現(spawn)は無音: 音もなく右から歩いてくる
  const EVENT_SFX: Partial<Record<GameEvent['type'], SfxName>> = {
    shot: 'shot',
    miss: 'miss',
    kill: 'kill',
    autokill: 'kill',
    crossed: 'damage',
    release: 'release',
    bonus: 'bonus',
  };

  function processEvents(g: Game, sound: boolean): GameEvent[] {
    const events = g.drainEvents();
    renderer.handleEvents(g, events);
    if (sound) {
      for (const ev of events) {
        const name = EVENT_SFX[ev.type];
        if (name) audio.play(name);
      }
    }
    return events;
  }

  // ---------- メインループ ----------

  // HUD 左上のロゴタップ = Esc と同じ(プレイ中の一時停止)
  canvas.addEventListener('click', (e) => {
    if (state !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1600;
    const y = ((e.clientY - rect.top) / rect.height) * 900;
    if (x < 260 && y < 96) {
      audio.play('pause'); // 拳銃を構える
      state = 'paused';
      ui.show('pause');
    }
  });

  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') {
      state = 'paused';
      ui.show('pause');
    }
  });

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    let countdown: Scene['countdown'] = null;

    switch (state) {
      case 'title':
      case 'mode': {
        if (demoGame) {
          const key = demoBot.update(dt, demoGame);
          if (key) demoGame.handleKey(key);
          demoGame.update(dt);
          processEvents(demoGame, false);
          if (demoGame.status !== 'running') newDemo();
        }
        break;
      }
      case 'countdown': {
        cdTimer += dt;
        const step = cdSteps[cdIndex];
        if (cdTimer >= step.dur) {
          cdTimer -= step.dur;
          cdIndex++;
          if (cdIndex >= cdSteps.length) {
            beginPlay();
          } else if (cdSteps[cdIndex].sfx) {
            audio.play(cdSteps[cdIndex].sfx!);
          }
        }
        if (state === 'countdown') {
          countdown = { text: cdSteps[cdIndex].text, t: cdTimer };
        }
        break;
      }
      case 'playing': {
        if (goTimer > 0) {
          goTimer -= dt;
          countdown = { text: COUNTDOWN.goText, t: 0.2 + Math.max(0, goTimer) };
        }
        if (game) {
          game.update(dt);
          const events = processEvents(game, true);
          for (const ev of events) {
            if (ev.type === 'clear') finishGame('clear');
            else if (ev.type === 'gameover') finishGame('gameover');
          }
        }
        break;
      }
      case 'ending': {
        if (endFade) {
          endFade.t += dt / endDelay;
          if (game) processEvents(game, true);
          if (endFade.t >= 1) {
            endFade.t = 1;
            showResult();
          }
        }
        break;
      }
      default:
        break;
    }

    const scene: Scene = {
      game: game ?? demoGame,
      countdown,
      showRomaji: settings.romaji,
      demo: game === null,
      endFade,
    };
    renderer.render(scene, dt);
    requestAnimationFrame(frame);
  }

  // 開発時のみ: 動作検証用フック(本番ビルドには含まれない)
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__zt = {
      get game() {
        return game;
      },
      get state() {
        return state;
      },
    };
  }

  gotoTitle();
  requestAnimationFrame(frame);
}

void boot();
