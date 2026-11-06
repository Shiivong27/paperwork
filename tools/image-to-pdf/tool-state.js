const processing = new Set();

export const isProcessing = () => processing.size > 0;

export function setProcessing(tool, value) {
  if (value) processing.add(tool);
  else processing.delete(tool);
  document.dispatchEvent(new CustomEvent('paperwork-processing'));
}
