/**
 * 音声システム。
 * - BGM: mp3 ファイル 2 曲(メニュー / 戦闘)。戦闘曲は開始からリザルトまで流れ続ける
 * - 銃声・ボタン音: mp3 を AudioBuffer に事前デコードして低遅延再生(連打対応)
 * - ミス・撃破・被弾などの効果音: WebAudio 合成(外部素材なし)
 */

import { AUDIO } from '../config';

export type SfxName =
  | 'shot' // 拳銃(ファイル)
  | 'bolt' // ボルトアクション(ファイル・ナビゲーション系ボタン)
  | 'ready' // 銃を構える(ファイル・ゲーム開始系ボタン)
  | 'shell' // 薬莢(ファイル・ランキングボタン)
  | 'pause' // 拳銃を構える(ファイル・一時停止)
  | 'resume' // ボルトリリース(ファイル・再開)
  | 'select' // カルーセル矢印(ファイル)
  | 'miss'
  | 'kill'
  | 'damage'
  | 'release'
  | 'bonus'
  | 'tick'
  | 'go'
  | 'gameover';

/** BGM の種類(battle=夜明けまで / hardcore / endless=夜は明けない) */
export type BgmKind = 'menu' | 'battle' | 'hardcore' | 'endless' | null;

const BGM_FILES: Record<Exclude<BgmKind, null>, string> = {
  menu: 'bgm-menu.mp3',
  battle: 'bgm-battle.mp3',
  hardcore: 'bgm-hardcore.mp3',
  endless: 'bgm-endless.mp3',
};

export interface AudioSettings {
  volume: number; // 0〜1
  sfxOn: boolean;
  bgmOn: boolean;
}

const SR = 44100;

/** 再生時の個別音量・ピッチ揺らぎ */
const PLAY_TUNING: Partial<Record<SfxName, { gain?: number; rateJitter?: number }>> = {
  shot: { gain: 0.75, rateJitter: 0.08 },
  bolt: { gain: 0.9 },
  ready: { gain: 0.9 },
  shell: { gain: 0.9 },
  pause: { gain: 0.9 },
  resume: { gain: 0.9 },
  select: { gain: 0.85 },
  kill: { gain: 1.0, rateJitter: 0.08 },
  miss: { gain: 0.85 },
};

async function render(
  seconds: number,
  build: (ctx: OfflineAudioContext, out: AudioNode) => void,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;
  comp.connect(ctx.destination);
  build(ctx, comp);
  return ctx.startRendering();
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * SR), SR);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function env(ctx: BaseAudioContext, peak: number, decay: number, at = 0, attack = 0.001): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  dur: number,
  at = 0,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
  o.start(at);
  o.stop(at + dur + 0.02);
  return o;
}

function noiseHit(
  ctx: BaseAudioContext,
  out: AudioNode,
  opt: {
    at?: number;
    dur: number;
    type: BiquadFilterType;
    freq: number;
    freqEnd?: number;
    q?: number;
    peak: number;
    attack?: number;
  },
): void {
  const at = opt.at ?? 0;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, opt.dur + 0.02);
  const f = ctx.createBiquadFilter();
  f.type = opt.type;
  f.frequency.setValueAtTime(opt.freq, at);
  if (opt.freqEnd) f.frequency.exponentialRampToValueAtTime(opt.freqEnd, at + opt.dur);
  if (opt.q) f.Q.value = opt.q;
  const g = env(ctx, opt.peak, opt.dur, at, opt.attack ?? 0.001);
  n.connect(f).connect(g).connect(out);
  n.start(at);
}

function drive(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 127.5) - 1;
    curve[i] = Math.tanh(x * amount);
  }
  ws.curve = curve;
  return ws;
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private settings: AudioSettings = { volume: AUDIO.masterVolume, sfxOn: true, bgmOn: true };
  private initPromise: Promise<void> | null = null;

  private bgms: Partial<Record<Exclude<BgmKind, null>, HTMLAudioElement>> = {};
  private desiredBgm: BgmKind = null;

  /** 最初のユーザー操作で呼ぶ(AudioContext / audio 再生の制約対策) */
  ensureInit(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.init();
    return this.initPromise;
  }

  applySettings(s: AudioSettings): void {
    this.settings = { ...s };
    if (this.ctx) {
      this.master.gain.value = s.volume;
      this.sfxBus.gain.value = s.sfxOn ? AUDIO.sfxVolume : 0;
    }
    this.updateBgmVolumes();
  }

  play(name: SfxName): void {
    if (!this.ctx || !this.settings.sfxOn) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const tune = PLAY_TUNING[name];
    if (tune?.rateJitter) {
      src.playbackRate.value = 1 - tune.rateJitter / 2 + Math.random() * tune.rateJitter;
    }
    const g = this.ctx.createGain();
    g.gain.value = tune?.gain ?? 1;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  /**
   * BGM の切り替え。
   * - 'menu': タイトル・モード選択
   * - 'battle' / 'hardcore' / 'endless': カウントダウン〜プレイ〜リザルトまで流し続ける
   * restart=true なら曲を頭から再生し直す
   */
  setBgm(kind: BgmKind, restart = false): void {
    this.desiredBgm = kind;
    const els = Object.values(this.bgms);
    if (els.length === 0) return; // init 前は desired だけ覚える
    const target = kind ? this.bgms[kind] ?? null : null;
    for (const el of els) {
      if (el !== target && !el.paused) el.pause();
    }
    if (target) {
      if (restart) target.currentTime = 0;
      if (target.paused) void target.play().catch(() => {});
    }
  }

  private updateBgmVolumes(): void {
    const v = this.settings.bgmOn ? this.settings.volume * AUDIO.musicVolume : 0;
    for (const el of Object.values(this.bgms)) el.volume = v;
  }

  private async init(): Promise<void> {
    this.ctx = new AudioContext();
    await this.ctx.resume().catch(() => {});
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);

    const base = import.meta.env.BASE_URL;

    // BGM(ストリーミング再生・モード別)
    for (const [kind, file] of Object.entries(BGM_FILES)) {
      const el = new Audio(`${base}audio/${file}`);
      el.loop = true;
      el.preload = 'auto';
      this.bgms[kind as Exclude<BgmKind, null>] = el;
    }

    this.applySettings(this.settings);

    // ファイル効果音のデコード
    const loadFile = async (name: SfxName, url: string) => {
      try {
        const res = await fetch(`${base}audio/${url}`);
        const data = await res.arrayBuffer();
        const buf = await this.ctx!.decodeAudioData(data);
        this.buffers.set(name, buf);
      } catch {
        /* ファイルが無ければ無音(致命的ではない) */
      }
    };

    // 合成効果音
    const defs: [string, Promise<AudioBuffer>][] = [
      // ミス: 空撃ちのドライファイア(カチッ)
      ['miss', render(0.12, (c, out) => {
        noiseHit(c, out, { dur: 0.01, type: 'highpass', freq: 2400, peak: 0.55 });
        noiseHit(c, out, { at: 0.045, dur: 0.018, type: 'bandpass', freq: 1100, q: 2, peak: 0.5 });
        const o = osc(c, 'sine', 320, 190, 0.04, 0.045);
        const g = env(c, 0.18, 0.05, 0.045);
        o.connect(g).connect(out);
      })],
      // 撃破: 肉が弾ける+低い炸裂
      ['kill', render(0.6, (c, out) => {
        const sub = osc(c, 'sine', 110, 26, 0.42);
        const sg = env(c, 1.0, 0.46, 0, 0.004);
        sub.connect(drive(c, 3.2)).connect(sg).connect(out);
        const n = c.createBufferSource();
        n.buffer = noiseBuffer(c, 0.55);
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1500, 0);
        f.frequency.exponentialRampToValueAtTime(110, 0.5);
        const ng = env(c, 0.8, 0.52, 0, 0.003);
        n.connect(f).connect(drive(c, 2.0)).connect(ng).connect(out);
        n.start(0);
        for (const t of [0.05, 0.09, 0.16]) {
          noiseHit(c, out, { at: t, dur: 0.03, type: 'bandpass', freq: 500 + t * 2000, q: 1.5, peak: 0.3 });
        }
      })],
      // 被ダメ: 重い衝撃
      ['damage', render(0.7, (c, out) => {
        const sub = osc(c, 'sine', 74, 20, 0.55);
        const sg = env(c, 1.15, 0.6, 0, 0.005);
        sub.connect(drive(c, 3.6)).connect(sg).connect(out);
        noiseHit(c, out, { dur: 0.26, type: 'lowpass', freq: 420, freqEnd: 120, peak: 0.6 });
        const ring = osc(c, 'triangle', 196, 130, 0.4);
        const rg = env(c, 0.12, 0.42, 0.02);
        ring.connect(rg).connect(out);
      })],
      // Enter(ターゲット解除): 小さな機械音
      ['release', render(0.14, (c, out) => {
        noiseHit(c, out, { dur: 0.015, type: 'bandpass', freq: 1900, q: 1.5, peak: 0.4 });
        noiseHit(c, out, { at: 0.07, dur: 0.022, type: 'bandpass', freq: 850, q: 1.2, peak: 0.5 });
        const o = osc(c, 'sine', 520, 300, 0.03, 0.07);
        const g = env(c, 0.12, 0.04, 0.07);
        o.connect(g).connect(out);
      })],
      // ボーナス発動
      ['bonus', render(0.7, (c, out) => {
        for (const [i, f] of [220, 330].entries()) {
          const o = osc(c, 'sine', f, f, 0.4, i * 0.12);
          const g = env(c, 0.3, 0.4, i * 0.12, 0.01);
          o.connect(g).connect(out);
        }
        noiseHit(c, out, { at: 0.24, dur: 0.3, type: 'highpass', freq: 5200, peak: 0.06, attack: 0.05 });
      })],
      // カウントダウン
      ['tick', render(0.09, (c, out) => {
        const o = osc(c, 'square', 740, 740, 0.06);
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1400;
        const g = env(c, 0.22, 0.06);
        o.connect(f).connect(g).connect(out);
      })],
      // 開始
      ['go', render(0.5, (c, out) => {
        noiseHit(c, out, { dur: 0.02, type: 'bandpass', freq: 2100, q: 1.4, peak: 0.55 });
        noiseHit(c, out, { at: 0.09, dur: 0.03, type: 'bandpass', freq: 950, q: 1.1, peak: 0.65 });
        const sub = osc(c, 'sine', 95, 44, 0.3, 0.12);
        const sg = env(c, 0.7, 0.32, 0.12, 0.01);
        sub.connect(drive(c, 2.2)).connect(sg).connect(out);
      })],
      // ゲームオーバー: 沈む低音(BGMに重なっても違和感のない無調性)
      ['gameover', render(1.8, (c, out) => {
        const o = osc(c, 'sawtooth', 150, 42, 1.3);
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(500, 0);
        f.frequency.exponentialRampToValueAtTime(90, 1.3);
        const g = env(c, 0.45, 1.4, 0, 0.02);
        o.connect(f).connect(g).connect(out);
        for (const t of [0.15, 0.55]) {
          const b = osc(c, 'sine', 62, 34, 0.18, t);
          const bg2 = env(c, 0.7, 0.2, t, 0.004);
          b.connect(drive(c, 2.6)).connect(bg2).connect(out);
        }
      })],
    ];

    const [rendered] = await Promise.all([
      Promise.all(defs.map(([, p]) => p)),
      loadFile('shot', 'shot.mp3'),
      loadFile('bolt', 'bolt.mp3'),
      loadFile('ready', 'ready.mp3'),
      loadFile('shell', 'shell.mp3'),
      loadFile('pause', 'pause.mp3'),
      loadFile('resume', 'resume.mp3'),
      loadFile('select', 'select.mp3'),
    ]);
    defs.forEach(([name], i) => this.buffers.set(name, rendered[i]));

    // init 前に要求されていた BGM を開始
    this.setBgm(this.desiredBgm);
  }
}
