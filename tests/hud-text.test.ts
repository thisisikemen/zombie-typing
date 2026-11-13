import { describe, expect, it, vi } from 'vitest';
import { drawHudValue, hudValueLayout, HUD_NUMBER_FONT } from '../src/render/hud-text';

describe('HUD value/unit layout', () => {
  it.each([31.14, 42.50, 44.27])('reserves measured unit width %s plus a gap', (unitWidth) => {
    const layout = hudValueLayout(682, 104, unitWidth);
    expect(682 - unitWidth - layout.valueRight).toBeCloseTo(6);
    expect(layout.valueRight - layout.valueMaxWidth).toBeCloseTo(578);
  });
  it('does not reserve a gap without a unit', () => {
    expect(hudValueLayout(902, 174, 0)).toEqual({ valueRight: 902, valueMaxWidth: 174 });
  });
  it('draws measured units separately and bounds even long values', () => {
    const calls: unknown[][] = [];
    const ctx = { save: vi.fn(), restore: vi.fn(), font: '', fillStyle: '', textAlign: '',
      measureText: vi.fn(() => ({ width: 44.27 })),
      fillText: (...args: unknown[]) => calls.push([ctx.font, ...args]) };
    drawHudValue(ctx as unknown as CanvasRenderingContext2D, '100000', '/100', 682, 58, 104, 30, 16, 'cyan', 'gray');
    expect(calls[0]).toEqual([`700 16px ${HUD_NUMBER_FONT}`, '/100', 682, 58]);
    expect(calls[1][0]).toBe(`900 30px ${HUD_NUMBER_FONT}`);
    expect(calls[1][2]).toBeCloseTo(631.73);
    expect(calls[1][4]).toBeCloseTo(53.73);
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});
