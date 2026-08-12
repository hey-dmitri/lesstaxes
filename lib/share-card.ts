/**
 * Where the share card image lives.
 *
 * One image serves two purposes: the preview that messaging apps fetch, and
 * the file the "Save image" button downloads. Same URL, same picture — they
 * cannot drift apart, which they would if the download were drawn separately
 * on a canvas.
 */

export function cardPath(payload: string): string {
  return `/api/card/${payload}`;
}

/** Filename for a downloaded card, e.g. "chicago-il-to-austin-tx-lesstaxes.png". */
export function cardFilename(slug: string): string {
  return `${slug}-lesstaxes.png`;
}
