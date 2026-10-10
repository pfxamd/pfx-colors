import { useRef, useState, useEffect, type DragEvent } from "react";
import { copyColorText } from "./clipboard";
import { extractPaletteFromPixels } from "./image-palette-model";
import { normalizeHex } from "./color-library";

type Props = {
  select: (hex: string) => void;
  saveSet: (name: string, colors: readonly string[]) => void;
  openGradient: (colors: readonly string[]) => void;
};
type Palette = { hex: string; pixels: number };
type Picture = { preview: string; name: string; width: number; height: number };

async function readImage(file: File, count: number): Promise<{ picture: Picture; colors: Palette[] }> {
  if (!["image/jpeg","image/png","image/webp","image/gif","image/avif"].includes(file.type))
    throw new Error("Choose PNG, JPEG, WebP, GIF or AVIF");
  if (file.size > 15 * 1024 * 1024) throw new Error("Maximum image size is 15 MB");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 45_000_000)
      throw new Error("Image dimensions are too large");
    const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let colors: Palette[] = [];
    try {
      const { ColorThiefAdapter } = await import("../../vendor/PFx-Color-Core/src/engine/adapters/color-thief-adapter");
      const result = await new ColorThiefAdapter().extractPalette(canvas, {
        colorCount: count, quality: 4, colorSpace: "oklch", gamut: "srgb",
      });
      const used = new Set<string>();
      colors = result.colors.flatMap(item => {
        const code = normalizeHex(item.hex);
        if (!code || used.has(code)) return [];
        used.add(code);
        return [{hex:code,pixels:item.population}];
      }).slice(0,count);
    } catch { /* Quantized fallback for unsupported browser extraction. */ }
    if (colors.length === 0) colors = extractPaletteFromPixels(pixels,count);
    return {
      picture: { preview: canvas.toDataURL("image/png"), name: file.name.slice(0,90),
        width:image.naturalWidth,height:image.naturalHeight },
      colors,
    };
  } finally { URL.revokeObjectURL(url); }
}

export function ImagePalette({ select, saveSet, openGradient }: Props) {
  const [picture,setPicture] = useState<Picture|null>(null);
  const [colors,setColors] = useState<Palette[]>([]);
  const [count,setCount] = useState(6);
  const [busy,setBusy] = useState(false);
  const [over,setOver] = useState(false);
  const [status,setStatus] = useState("");
  const source = useRef<File|null>(null);
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  const process = async (file: File, total = count) => {
    const rev = ++revision.current;
    setBusy(true);
    setStatus("Extracting colors…");
    try {
      const result = await readImage(file,total);
      if (revision.current !== rev) return;
      source.current = file;
      setPicture(result.picture);
      setColors(result.colors);
      setStatus(result.colors.length + " colors extracted");
    } catch (error) {
      if (revision.current === rev)
        setStatus(error instanceof Error ? error.message : "Unable to read image");
    } finally {
      if (revision.current === rev) setBusy(false);
    }
  };
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void process(file);
  };
  const hexes = colors.map(c=>c.hex);
  const copy = async (text: string) => setStatus(
    await copyColorText(text) ? "Colors copied" : "Clipboard unavailable");
  return <section className="pfx-v2__page pfx-image" aria-label="Image palette workspace">
    <div className="pfx-v2__page-heading"><div>
      <span className="pfx-v2__eyebrow">EXTRACT FROM IMAGES</span>
      <h1>Image palette.</h1>
      <p>Discover colors from images. Processing stays in your browser.</p>
    </div></div>
    <div className="pfx-image__layout">
      <div className="pfx-image__panel">
        <div className="pfx-image__head"><strong>01 / IMAGE SOURCE</strong><span>PNG · JPG · WEBP</span></div>
        <div className={"pfx-image__drop"+(over?" pfx-is-over":"")}
          onDragOver={e=>{e.preventDefault();setOver(true);}}
          onDragLeave={e=>{e.preventDefault();setOver(false);}} onDrop={drop}>
          {picture ? <img src={picture.preview} alt={"Source " + picture.name} /> :
            <div className="pfx-image__placeholder"><strong>Choose an image</strong><span>or drop a file here</span></div>}
        </div>
        <div className="pfx-image__source-actions">
          <label className="pfx-image__upload">Choose image
            <input aria-label="Choose image" type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              onChange={event=>{
                const file=event.currentTarget.files?.[0];event.currentTarget.value="";
                if(file) void process(file);
              }} />
          </label>
          <label className="pfx-image__count">Colors
            <select aria-label="Palette color count" value={count} onChange={event=>{
              const next=Number(event.target.value);setCount(next);
              if(source.current) void process(source.current,next);
            }}>{[4,6,8,10].map(n=><option key={n} value={n}>{n}</option>)}</select>
          </label>
        </div>
        {picture && <div className="pfx-image__meta"><strong title={picture.name}>{picture.name}</strong>
          <span>{picture.width} × {picture.height} px</span></div>}
        <p className="pfx-image__status" role="status" aria-live="polite">{status}</p>
      </div>
      <div className="pfx-image__panel">
        <div className="pfx-image__head"><strong>02 / EXTRACTED COLORS</strong><span>{colors.length} colors</span></div>
        {colors.length ? <>
          <div className="pfx-image__strip" aria-label="Image colors">
            {colors.map(c=><span key={c.hex} style={{backgroundColor:c.hex}} />)}
          </div>
          <div className="pfx-image__swatches">{colors.map((c,index)=><article key={c.hex}>
            <button type="button" className="pfx-image__swatch" aria-label={"Use extracted "+c.hex}
              style={{backgroundColor:c.hex}} onClick={()=>select(c.hex)}>
              <span>{String(index+1).padStart(2,"0")}</span>
            </button>
            <div><code>{c.hex.toUpperCase()}</code>
              <button type="button" aria-label={"Copy extracted "+c.hex}
                onClick={()=>void copy(c.hex.toUpperCase())}>Copy</button></div>
          </article>)}</div>
          <div className="pfx-image__actions">
            <button type="button" onClick={()=>{
              saveSet("Image · "+(picture?.name??"Palette"),hexes);
              setStatus("Palette saved to Collections");
            }}>Save palette</button>
            <button type="button" disabled={hexes.length<2}
              onClick={()=>openGradient(hexes)}>Send to Gradient →</button>
            <button type="button" onClick={()=>void copy(hexes.join("\n").toUpperCase())}>Copy all HEX</button>
          </div>
        </> : <div className="pfx-image__empty">{busy
          ? "Reading image colors…" : "Your palette will appear here."}</div>}
      </div>
    </div>
  </section>;
}