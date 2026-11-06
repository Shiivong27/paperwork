export function pageLayout(width, height, rotation, options) {
  const turn = ((rotation % 360) + 360) % 360;
  const sideways = turn === 90 || turn === 270;
  const imageWidth = sideways ? height : width;
  const imageHeight = sideways ? width : height;
  const margin = Number(options.margin);
  let pageWidth, pageHeight;
  if (options.size === 'image') {
    const naturalScale = Math.min(0.75, (14400 - margin * 2) / Math.max(imageWidth, imageHeight));
    pageWidth = imageWidth * naturalScale + margin * 2;
    pageHeight = imageHeight * naturalScale + margin * 2;
  } else {
    [pageWidth, pageHeight] = options.size === 'letter' ? [612, 792] : [595.28, 841.89];
    if (options.orientation === 'landscape' || (options.orientation === 'auto' && imageWidth > imageHeight)) {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }
  }
  const scale = Math.min((pageWidth - 2 * margin) / imageWidth, (pageHeight - 2 * margin) / imageHeight);
  const boxWidth = imageWidth * scale, boxHeight = imageHeight * scale;
  const x = (pageWidth - boxWidth) / 2, y = (pageHeight - boxHeight) / 2;
  const offsets = { 0: [0, 0, 0], 90: [0, boxHeight, -90], 180: [boxWidth, boxHeight, 180], 270: [boxWidth, 0, 90] };
  const [dx, dy, angle] = offsets[turn];
  return { pageWidth, pageHeight, boxWidth, boxHeight, x, y,
    draw: { x: x + dx, y: y + dy, width: width * scale, height: height * scale, angle } };
}

export async function createPdf(images, options, library, onProgress = () => {}) {
  const { PDFDocument, degrees, rgb } = library;
  const doc = await PDFDocument.create();
  doc.setTitle(options.title || 'My images');
  doc.setCreator('Paperwork · local image-to-PDF');
  for (let index = 0; index < images.length; index++) {
    const item = await images[index]();
    const embedded = item.type === 'image/jpeg' ? await doc.embedJpg(item.bytes) : await doc.embedPng(item.bytes);
    const layout = pageLayout(embedded.width, embedded.height, item.rotation, options);
    const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    page.drawRectangle({ x: 0, y: 0, width: layout.pageWidth, height: layout.pageHeight, color: rgb(1, 1, 1) });
    const { angle, ...draw } = layout.draw;
    page.drawImage(embedded, { ...draw, rotate: degrees(angle) });
    onProgress(index + 1, images.length);
    await doc.flush();
  }
  return doc.save();
}
