"""
素材加工パイプライン。
ChatGPT 等で生成したスプライトシートをゲーム用に変換する。

やること:
  1. 偽透過(白背景・市松柄)のキーイング
     - 画像の外周からフラッドフィルで背景色を辿って透過にする
     - キャラ内部の白(目など)は塗りつぶされないので保護される
  2. 本物のアルファがある画像はそのまま利用
  3. スプライトシートを連結成分でキャラ単位に切り出し
     (腕がセル境界をまたいでいても正しく分離できる)
  4. 全フレームを同一キャンバスに、足元(下端)・水平中央で揃える

使い方:
  python3 -m venv .venv && .venv/bin/pip install pillow
  .venv/bin/python tools/process_assets.py <入力シート.png> <出力プレフィックス>

  例: Tier2 ゾンビの新しいシートを変換して配置
  .venv/bin/python tools/process_assets.py ~/Downloads/zombie2_sheet.png \
      "public/assets/zombie2_walk"
  → public/assets/zombie2_walk_1.png ... _4.png が生成される

  兵士など 1 枚絵の場合はフレーム数 1 を指定:
  .venv/bin/python tools/process_assets.py ~/Downloads/soldier.png \
      "public/assets/soldier_body" --frames 1
"""

import argparse
import sys
from collections import deque

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow が必要です: pip install pillow')


def is_bg_color(p):
    """背景(白・市松グレー)とみなす色か"""
    r, g, b = p[0], p[1], p[2]
    lum = (r + g + b) / 3
    chroma = max(abs(r - g), abs(g - b), abs(r - b))
    return chroma < 16 and lum > 176


def has_real_alpha(img):
    if img.mode != 'RGBA':
        return False
    alphas = img.getchannel('A').getextrema()
    return alphas[0] < 250


def key_flood(rgba):
    """外周から背景色を辿って透過にする"""
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg_color(px[x, y]) and not visited[y * w + x]:
                visited[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg_color(px[x, y]) and not visited[y * w + x]:
                visited[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx] and is_bg_color(px[nx, ny]):
                visited[ny * w + nx] = 1
                q.append((nx, ny))
    # 縁の白ハロー軽減
    for _ in range(2):
        edge = []
        for y in range(h):
            for x in range(w):
                p = px[x, y]
                if p[3] == 0:
                    continue
                lum = (p[0] + p[1] + p[2]) / 3
                chroma = max(abs(p[0] - p[1]), abs(p[1] - p[2]), abs(p[0] - p[2]))
                if lum > 150 and chroma < 24:
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                            edge.append((x, y))
                            break
        for x, y in edge:
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 0)
    return rgba


def connected_components(rgba, alpha_thresh=8):
    """アルファの連結成分(8近傍)を列挙"""
    w, h = rgba.size
    px = rgba.load()
    label = bytearray(w * h)
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0][3] > alpha_thresh and not label[y0 * w + x0]:
                q = deque([(x0, y0)])
                label[y0 * w + x0] = 1
                pixels = []
                sx = 0
                while q:
                    x, y = q.popleft()
                    pixels.append((x, y))
                    sx += x
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < w and 0 <= ny < h and not label[ny * w + nx] \
                                    and px[nx, ny][3] > alpha_thresh:
                                label[ny * w + nx] = 1
                                q.append((nx, ny))
                comps.append({'pixels': pixels, 'cx': sx / len(pixels)})
    return comps


def extract_frames(rgba, n_frames):
    """連結成分をフレームにまとめて個別キャンバスへ"""
    comps = connected_components(rgba)
    if len(comps) < n_frames:
        sys.exit(f'エラー: キャラの塊が {len(comps)} 個しか見つかりません(期待: {n_frames})')
    comps.sort(key=lambda c: -len(c['pixels']))
    big = sorted(comps[:n_frames], key=lambda c: c['cx'])
    # 小成分(浮いた手・影の断片)は最寄りの本体へマージ
    for s in comps[n_frames:]:
        nearest = min(big, key=lambda b: abs(b['cx'] - s['cx']))
        nearest['pixels'].extend(s['pixels'])

    px = rgba.load()
    frames = []
    for c in big:
        xs = [p[0] for p in c['pixels']]
        ys = [p[1] for p in c['pixels']]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        canvas = Image.new('RGBA', (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
        cpx = canvas.load()
        for (x, y) in c['pixels']:
            cpx[x - x0, y - y0] = px[x, y]
        frames.append(canvas)
    return frames


def align_frames(frames, pad=4):
    """同一キャンバス・足元(下端)・水平中央で揃える"""
    cw = max(f.width for f in frames) + pad * 2
    ch = max(f.height for f in frames) + pad
    out = []
    for f in frames:
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.paste(f, ((cw - f.width) // 2, ch - f.height))
        out.append(canvas)
    return out


def main():
    ap = argparse.ArgumentParser(description='スプライトシート → ゲーム用フレーム変換')
    ap.add_argument('input', help='入力 PNG(シートまたは1枚絵)')
    ap.add_argument('output_prefix', help='出力プレフィックス(例: public/assets/zombie2_walk)')
    ap.add_argument('--frames', type=int, default=4, help='フレーム数(デフォルト 4)')
    args = ap.parse_args()

    img = Image.open(args.input).convert('RGBA')
    if has_real_alpha(img):
        print('本物の透過を検出 → キーイングをスキップ')
    else:
        print('偽透過(白/市松背景)を検出 → フラッドフィルでキーイング')
        img = key_flood(img)

    frames = extract_frames(img, args.frames)
    frames = align_frames(frames)

    if args.frames == 1:
        path = f'{args.output_prefix}.png'
        frames[0].save(path)
        print(f'保存: {path} ({frames[0].width}x{frames[0].height})')
    else:
        for i, f in enumerate(frames, 1):
            path = f'{args.output_prefix}_{i}.png'
            f.save(path)
            print(f'保存: {path} ({f.width}x{f.height})')


if __name__ == '__main__':
    main()
