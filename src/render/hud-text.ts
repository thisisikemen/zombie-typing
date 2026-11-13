/** Use the same Latin face rather than language-dependent generic sans-serif. */
export const HUD_NUMBER_FONT = 'Arial, "Helvetica Neue", sans-serif';

/** Keep values and their units separate even when font metrics differ. */
export function hudValueLayout(right: number, width: number, unitWidth: number, gap = 6) {
  const reserved = unitWidth > 0 ? unitWidth + gap : 0;
  return { valueRight: right - reserved, valueMaxWidth: Math.max(1, width - reserved) };
}

export function drawHudValue(
  ctx: CanvasRenderingContext2D,
  value: string,
  unit: string,
  right: number,
  y: number,
  width: number,
  size: number,
  unitSize: number,
  color: string,
  unitColor: string,
): void {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = `700 ${unitSize}px ${HUD_NUMBER_FONT}`;
  const layout = hudValueLayout(right, width, unit ? ctx.measureText(unit).width : 0);
  if (unit) {
    ctx.fillStyle = unitColor;
    ctx.fillText(unit, right, y);
  }
  ctx.font = `900 ${size}px ${HUD_NUMBER_FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(value, layout.valueRight, y, layout.valueMaxWidth);
  ctx.restore();
}
