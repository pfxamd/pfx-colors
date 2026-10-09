import type {
  ColorInput, ColorValue, ColorStudyResult, ColorStudyOptions,
  HarmonyScheme, HarmonyOptions, HarmonyResult, PaletteResult, TonalPaletteOptions,
  GradientDefinition, GradientOptions, GradientStopInput,
} from "@pfx/color-core";

type Raw = {space:string;channels:number[];alpha:number};
type Entry = {index:number;position:number;color:Raw;mapped:boolean;hueOffset:number};
type Core = {
 parseCss(value:string):Raw;
 convert(input:Raw,space:string):Raw;
 formatCss(input:Raw):string;
 formatHex(input:Raw,method?:string):string;
 colorStudy(input:Raw,options:Record<string,unknown>):{scheme:string;colors:{index:number;color:Raw;oklch:number[];mapped:boolean}[]};
 tonalPalette(input:Raw,options:Record<string,unknown>):Entry[];
 harmony(input:Raw,scheme:string,options:Record<string,unknown>):Entry[];
 createGradient(stops:{position:number;color:Raw}[],options:Record<string,unknown>):{
  sample(position:number):Raw;dispose():void;
 };
 isInGamut(input:Raw,target:string):boolean;
 mapGamut(input:Raw,target:string,method:string):Raw;
};
const coreSpace=(space:string)=>space==="p3"?"display-p3":space;
const legacySpace=(space:string)=>space==="display-p3"?"p3":space;
export function createExperimentalMath(core:Core) {
  const normalize=(input:ColorInput):Raw=>{
    if(typeof input==="string") return core.parseCss(input);
    return {space:coreSpace(input.space),channels:input.coordinates.map(x=>x??0),alpha:input.alpha??1};
  };
  const asValue=(color:Raw):ColorValue=>({
    space:legacySpace(color.space) as ColorValue["space"],
    coordinates:[...color.channels],alpha:color.alpha,
    css:core.formatCss(color),hex:core.formatHex(color,"css"),
  });
  const wrap=(color:Raw)=>({value:asValue(color),hex:core.formatHex(color,"css")});
  const study=(seed:ColorInput,options:ColorStudyOptions & {randomSeed:number}):ColorStudyResult=>{
    const controls={
      lightness:options.lightness??58,chroma:options.chroma??58,
      hueRange:options.hueRange??58,toneRange:options.toneRange??58,
    };
    const result=core.colorStudy(normalize(seed),{
      ...controls,randomSeed:options.randomSeed,target:coreSpace(options.targetSpace??"srgb"),gamut:"css",
    });
    return {seedHex:core.formatHex(normalize(seed),"css"),
      scheme:result.scheme==="splitComplementary"?"split-complementary":result.scheme as HarmonyScheme,
      controls, colors:result.colors.map(entry=>({
        index:entry.index,...wrap(entry.color),
        oklch:{l:entry.oklch[0],c:entry.oklch[1],h:entry.oklch[2]},mapped:entry.mapped,
      }))};
  };
  const palette=(seed:ColorInput,options:TonalPaletteOptions={}):PaletteResult=>{
    const items=core.tonalPalette(normalize(seed),{
      count:options.count??9,minLightness:options.minLightness??0.12,
      maxLightness:options.maxLightness??0.96,chromaScale:options.chromaScale??1,
      target:coreSpace(options.targetSpace??"srgb"),gamut:"css",
    });
    return {mode:"tonal",colors:items.map(entry=>({
      index:entry.index,position:entry.position,...wrap(entry.color),mapped:entry.mapped,
    }))};
  };
  const harmony=(seed:ColorInput,scheme:HarmonyScheme,options:HarmonyOptions={}):HarmonyResult=>{
    const source=normalize(seed);
    const base=core.convert(source,"oklch");
    const result=core.harmony(source,scheme==="split-complementary"?"splitComplementary":scheme,{
      target:coreSpace(options.targetSpace??"srgb"),gamut:"css",
      analogousAngle:options.analogousAngle??30,splitAngle:options.splitAngle??30,
      tetradicAngle:options.tetradicAngle??60,
    });
    return {scheme,baseHue:((base.channels[2]%360)+360)%360,
      colors:result.map(item=>({
        index:item.index,hueOffset:item.hueOffset,...wrap(item.color),mapped:item.mapped,
      }))};
  };
  const gradient=(stops:readonly GradientStopInput[],options:GradientOptions={}):GradientDefinition=>{
    const target=coreSpace(options.targetSpace??"srgb");
    const ordered=stops.map((item,order)=>({item,order})).sort((a,b)=>
      a.item.position-b.item.position||a.order-b.order);
    if(ordered.length<2||ordered.length>256)throw new RangeError("2..256 stops required");
    const normalized=ordered.map(({item},index)=>{
      if(!Number.isFinite(item.position)||item.position<0||item.position>1)
        throw new RangeError("Gradient position outside 0..1");
      const source=normalize(item.color);
      const color=core.isInGamut(source,target)?core.convert(source,target):
        core.mapGamut(source,target,"css");
      return {index,position:item.position,source:asValue(source),value:asValue(color),
        hex:core.formatHex(color,"css")};
    });
    const result:GradientDefinition={
      type:options.type??"linear",angle:((options.angle??90)%360+360)%360,
      centerX:options.centerX??0.5,centerY:options.centerY??0.5,
      interpolationSpace:options.interpolationSpace??"oklch",
      targetSpace:options.targetSpace??"srgb",hue:options.hue,
      stops:normalized,
    };
    const handle=openGradient(result);
    handle.dispose();
    return result;
  };
  function openGradient(def:GradientDefinition){
    return core.createGradient(def.stops.map(stop=>({
      position:stop.position,color:normalize(stop.source),
    })),{kind:def.type,angle:def.angle,centerX:def.centerX,centerY:def.centerY,
      space:coreSpace(def.interpolationSpace),target:coreSpace(def.targetSpace),
      hue:def.hue??"shorter",gamut:"css"});
  }
  const sample=(definition:GradientDefinition,position:number):ColorValue=>{
    const handle=openGradient(definition);
    try{return asValue(handle.sample(position));}
    finally{handle.dispose();}
  };
  const convert=(value:ColorInput,space:ColorValue["space"]):ColorValue=>
    asValue(core.convert(normalize(value),coreSpace(space)));
  const formatHex=(value:ColorInput):string=>core.formatHex(normalize(value),"css");
  return {study,palette,harmony,gradient,sample,convert,formatHex};
}
export type ExperimentalMath=ReturnType<typeof createExperimentalMath>;
