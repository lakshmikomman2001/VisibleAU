/**
 * 2 Nov -- an SVG logo is accepted only without scripts or references to
 * other files, and is turned into a PNG in the browser before it's
 * uploaded: the report PDF can draw only PNG and JPEG, and only PNG or
 * JPEG bytes are ever stored or served (lib/branding/logo.ts). An SVG with
 * a script, an event handler, embedded HTML (foreignObject), a DTD or a
 * link to anything outside itself is refused with a message rather than
 * cleaned: the browser wouldn't draw what it links to anyway, so the PNG
 * would quietly be missing parts.
 */

/** Why an SVG logo is refused, or null when it may be used. */
export function svgLogoProblem(svg: string): string | null {
  const s = svg.toLowerCase();
  if (!/<svg[\s>]/.test(s)) return "not an SVG";
  if (/<script[\s>/]/.test(s)) return "script";
  if (/\son[a-z]+\s*=/.test(s)) return "event handler";
  if (/<foreignobject[\s>/]/.test(s)) return "embedded HTML";
  if (/<!doctype|<!entity/.test(s)) return "DTD";
  if (/@import/.test(s)) return "external stylesheet";
  for (const m of s.matchAll(/\b(?:xlink:)?href\s*=\s*["']([^"']*)["']/g)) {
    const target = m[1].trim();
    if (!target.startsWith("#") && !/^data:image\/(png|jpe?g);base64,/.test(target)) {
      return "external reference";
    }
  }
  for (const m of s.matchAll(/url\(\s*["']?([^"')]*)/g)) {
    if (!m[1].trim().startsWith("#")) return "external reference";
  }
  return null;
}

/** The longest side of the PNG made from an SVG. */
export const SVG_PNG_SIZE = 512;

/**
 * Draws an SVG (already checked by svgLogoProblem) into a PNG, in the
 * browser: as an <img>, which runs no scripts and loads nothing else, then
 * onto a canvas. The longest side becomes SVG_PNG_SIZE pixels.
 */
export async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The SVG couldn't be drawn"));
      image.src = url;
    });
    const width = img.naturalWidth || SVG_PNG_SIZE;
    const height = img.naturalHeight || SVG_PNG_SIZE;
    const scale = SVG_PNG_SIZE / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No PNG"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
