export const fonts = { sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: 'monospace', script: 'cursive' };

export function wrapText(context, text, width) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? line + ' ' + word : word;
      if (context.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of Array.from(word)) {
        if (line && context.measureText(line + character).width > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function textHeight(context, mark) {
  context.font = `${mark.fontSize}px ${fonts[mark.font] || fonts.sans}`;
  return Math.max(1, wrapText(context, mark.text, Math.max(4, mark.w - 4)).length) * mark.fontSize * 1.3;
}

export function paintMarks(context, marks, assets) {
  for (const mark of marks) {
    context.save(); context.globalAlpha = mark.opacity ?? 1;
    context.fillStyle = mark.color || '#25332b'; context.strokeStyle = mark.color || '#25332b';
    if (mark.type === 'text') {
      context.font = `${mark.fontSize}px ${fonts[mark.font] || fonts.sans}`;
      context.textBaseline = 'alphabetic';
      const lines = wrapText(context, mark.text, Math.max(4, mark.w - 4));
      lines.forEach((line, index) => context.fillText(line, mark.x + 2, mark.y + mark.fontSize + index * mark.fontSize * 1.3));
    } else if (mark.type === 'image' || mark.type === 'signature') {
      const image = assets.get(mark.assetId)?.image;
      if (!image) throw new Error('An image addition is unavailable. Remove it and add it again.');
      context.drawImage(image, mark.x, mark.y, mark.w, mark.h);
    } else if (mark.type === 'highlight') {
      context.fillRect(mark.x, mark.y, mark.w, mark.h);
    } else {
      context.lineWidth = 2; context.beginPath();
      if (mark.type === 'ellipse') context.ellipse(mark.x + mark.w / 2, mark.y + mark.h / 2, Math.max(1, mark.w / 2 - 1), Math.max(1, mark.h / 2 - 1), 0, 0, Math.PI * 2);
      else context.rect(mark.x + 1, mark.y + 1, Math.max(1, mark.w - 2), Math.max(1, mark.h - 2));
      if (mark.fill) context.fill(); else context.stroke();
    }
    context.restore();
  }
}
