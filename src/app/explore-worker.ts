/// <reference lib="webworker" />
import { matchRgb, type ExploreFilters, type RgbOrder } from "./explore-model";
import { RGB_TOTAL, RGB_PAGE_SIZE } from "./color-library";

type Request = { id: number; anchor: number; cursor: number; order: RgbOrder; filters: ExploreFilters };
let current = 0;

// Stream exact 48-color pages without allocating a catalog of 16.7m colors.
// Every cursor is a bookmark in the complete RGB space.
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  current = request.id;
  void run(request);
};
async function run(request: Request) {
  let cursor = request.cursor;
  const matches: string[] = [];
  while (cursor < RGB_TOTAL && request.id === current && matches.length < RGB_PAGE_SIZE) {
    const until = Math.min(cursor + 32768, RGB_TOTAL);
    for (; cursor < until && matches.length < RGB_PAGE_SIZE; cursor++) {
      const index = (request.anchor + cursor) % RGB_TOTAL;
      let r = 0, g = 0, b = 0;
      if (request.order === "spectrum") {
        for (let bit = 0; bit < 8; bit++) {
          r |= ((index >>> (3 * bit)) & 1) << bit;
          g |= ((index >>> (3 * bit + 1)) & 1) << bit;
          b |= ((index >>> (3 * bit + 2)) & 1) << bit;
        }
      } else {
        const packed = request.order === "hex" ? index : RGB_TOTAL - 1 - index;
        r = (packed >>> 16) & 255;
        g = (packed >>> 8) & 255;
        b = packed & 255;
      }
      if (matchRgb(r, g, b, request.filters)) {
        matches.push("#" + [r,g,b].map(channel => channel.toString(16).padStart(2, "0")).join(""));
      }
    }
    if (cursor < RGB_TOTAL && matches.length < RGB_PAGE_SIZE) {
      self.postMessage({ kind: "progress", id: request.id, cursor });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  if (request.id === current) self.postMessage({
    kind: "result", id: request.id, colors: matches, nextCursor: cursor, end: cursor === RGB_TOTAL,
  });
}
