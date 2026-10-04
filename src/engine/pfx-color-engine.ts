import { ColorJsAdapter } from "./adapters/color-js-adapter";
import { ColorThiefAdapter } from "./adapters/color-thief-adapter";
import type { ColorEngine } from "./types/color";
import type { ImagePaletteExtractor } from "./types/image";

export class PfxColorEngine {
  readonly color: ColorEngine;
  readonly images: ImagePaletteExtractor;

  constructor(
    colorEngine: ColorEngine = new ColorJsAdapter(),
    imageExtractor: ImagePaletteExtractor = new ColorThiefAdapter(),
  ) {
    this.color = colorEngine;
    this.images = imageExtractor;
  }
}

export const colorEngine = new PfxColorEngine();
