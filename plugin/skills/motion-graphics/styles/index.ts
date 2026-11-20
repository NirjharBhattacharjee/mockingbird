// Every explainer style, by id. Written by `bun run styles` from the files in
// this folder; don't edit by hand.
import type { Look, Style } from "./look.ts";
import artDeco from "./art-deco.ts";
import asciiRender from "./ascii-render.ts";
import ballpointNotebook from "./ballpoint-notebook.ts";
import bauhaus from "./bauhaus.ts";
import blueprint from "./blueprint.ts";
import botanicalPlate from "./botanical-plate.ts";
import chalkboard from "./chalkboard.ts";
import claymation from "./claymation.ts";
import collageZine from "./collage-zine.ts";
import comic from "./comic.ts";
import constructivist from "./constructivist.ts";
import cosmic from "./cosmic.ts";
import crossStitch from "./cross-stitch.ts";
import crtTerminal from "./crt-terminal.ts";
import cutPaper from "./cut-paper.ts";
import deepSea from "./deep-sea.ts";
import editorialChart from "./editorial-chart.ts";
import editorialCollage from "./editorial-collage.ts";
import etchSketch from "./etch-sketch.ts";
import feltQuilt from "./felt-quilt.ts";
import filmNoir from "./film-noir.ts";
import flatSpace from "./flat-space.ts";
import flowField from "./flow-field.ts";
import gameboy from "./gameboy.ts";
import glassmorphism from "./glassmorphism.ts";
import gouachePoster from "./gouache-poster.ts";
import holographicFoil from "./holographic-foil.ts";
import illuminated from "./illuminated.ts";
import impastoOil from "./impasto-oil.ts";
import isometric from "./isometric.ts";
import isotype from "./isotype.ts";
import kawaii from "./kawaii.ts";
import kineticType from "./kinetic-type.ts";
import letterpress from "./letterpress.ts";
import lightPainting from "./light-painting.ts";
import linocut from "./linocut.ts";
import lowPoly from "./low-poly.ts";
import mac1bit from "./mac-1bit.ts";
import mangaPanel from "./manga-panel.ts";
import mathAnim from "./math-anim.ts";
import memphis from "./memphis.ts";
import mosaic from "./mosaic.ts";
import msPaint from "./ms-paint.ts";
import napkinSketch from "./napkin-sketch.ts";
import neonSign from "./neon-sign.ts";
import newsprint from "./newsprint.ts";
import opArt from "./op-art.ts";
import origami from "./origami.ts";
import oscilloscope from "./oscilloscope.ts";
import paperMarbling from "./paper-marbling.ts";
import papercraft from "./papercraft.ts";
import patentDrawing from "./patent-drawing.ts";
import pixel16bit from "./pixel-16bit.ts";
import pointillism from "./pointillism.ts";
import productLaunch from "./product-launch.ts";
import psychedelic from "./psychedelic.ts";
import ridgeline from "./ridgeline.ts";
import risograph from "./risograph.ts";
import screenprintGrid from "./screenprint-grid.ts";
import shadowPuppet from "./shadow-puppet.ts";
import sketchbookPencil from "./sketchbook-pencil.ts";
import soft3d from "./soft-3d.ts";
import spirograph from "./spirograph.ts";
import stainedGlass from "./stained-glass.ts";
import stickyNotes from "./sticky-notes.ts";
import stringArt from "./string-art.ts";
import sumiE from "./sumi-e.ts";
import swissGrid from "./swiss-grid.ts";
import synthwave from "./synthwave.ts";
import tarotCard from "./tarot-card.ts";
import techGlow from "./tech-glow.ts";
import teletext from "./teletext.ts";
import thermalCamera from "./thermal-camera.ts";
import topographic from "./topographic.ts";
import transitMap from "./transit-map.ts";
import truchet from "./truchet.ts";
import ukiyoE from "./ukiyo-e.ts";
import vaporwave from "./vaporwave.ts";
import vectorArcade from "./vector-arcade.ts";
import voxel from "./voxel.ts";
import watercolor from "./watercolor.ts";
import whiteboard from "./whiteboard.ts";
import win95 from "./win95.ts";
import wireframeTerrain from "./wireframe-terrain.ts";
import xRay from "./x-ray.ts";
import y2kChrome from "./y2k-chrome.ts";

export type { Look, Style };
// The shared helpers, so a look written for one video (guide("look")) can import them from "STYLES".
export * from "./look.ts";
/**
 * Each style's typography roles (#276): its title and body fonts, its ink,
 * accent and background, read from what it draws by
 * `bun scripts/style-roles.ts`. A look's titles, lower thirds and captions
 * take them together.
 */
export { default as ROLES } from "./roles.json";
export const STYLES: Record<string, Style> = {
  "art-deco": artDeco,
  "ascii-render": asciiRender,
  "ballpoint-notebook": ballpointNotebook,
  "bauhaus": bauhaus,
  "blueprint": blueprint,
  "botanical-plate": botanicalPlate,
  "chalkboard": chalkboard,
  "claymation": claymation,
  "collage-zine": collageZine,
  "comic": comic,
  "constructivist": constructivist,
  "cosmic": cosmic,
  "cross-stitch": crossStitch,
  "crt-terminal": crtTerminal,
  "cut-paper": cutPaper,
  "deep-sea": deepSea,
  "editorial-chart": editorialChart,
  "editorial-collage": editorialCollage,
  "etch-sketch": etchSketch,
  "felt-quilt": feltQuilt,
  "film-noir": filmNoir,
  "flat-space": flatSpace,
  "flow-field": flowField,
  "gameboy": gameboy,
  "glassmorphism": glassmorphism,
  "gouache-poster": gouachePoster,
  "holographic-foil": holographicFoil,
  "illuminated": illuminated,
  "impasto-oil": impastoOil,
  "isometric": isometric,
  "isotype": isotype,
  "kawaii": kawaii,
  "kinetic-type": kineticType,
  "letterpress": letterpress,
  "light-painting": lightPainting,
  "linocut": linocut,
  "low-poly": lowPoly,
  "mac-1bit": mac1bit,
  "manga-panel": mangaPanel,
  "math-anim": mathAnim,
  "memphis": memphis,
  "mosaic": mosaic,
  "ms-paint": msPaint,
  "napkin-sketch": napkinSketch,
  "neon-sign": neonSign,
  "newsprint": newsprint,
  "op-art": opArt,
  "origami": origami,
  "oscilloscope": oscilloscope,
  "paper-marbling": paperMarbling,
  "papercraft": papercraft,
  "patent-drawing": patentDrawing,
  "pixel-16bit": pixel16bit,
  "pointillism": pointillism,
  "product-launch": productLaunch,
  "psychedelic": psychedelic,
  "ridgeline": ridgeline,
  "risograph": risograph,
  "screenprint-grid": screenprintGrid,
  "shadow-puppet": shadowPuppet,
  "sketchbook-pencil": sketchbookPencil,
  "soft-3d": soft3d,
  "spirograph": spirograph,
  "stained-glass": stainedGlass,
  "sticky-notes": stickyNotes,
  "string-art": stringArt,
  "sumi-e": sumiE,
  "swiss-grid": swissGrid,
  "synthwave": synthwave,
  "tarot-card": tarotCard,
  "tech-glow": techGlow,
  "teletext": teletext,
  "thermal-camera": thermalCamera,
  "topographic": topographic,
  "transit-map": transitMap,
  "truchet": truchet,
  "ukiyo-e": ukiyoE,
  "vaporwave": vaporwave,
  "vector-arcade": vectorArcade,
  "voxel": voxel,
  "watercolor": watercolor,
  "whiteboard": whiteboard,
  "win95": win95,
  "wireframe-terrain": wireframeTerrain,
  "x-ray": xRay,
  "y2k-chrome": y2kChrome,
};

/** The Look for `id` this frame: style("whiteboard", ctx, t, m).title("How AI learns"). */
export function style(id: string, ctx: any, t: number, m: any): Look {
  const s = STYLES[id];
  if (!s) throw new Error(`No style "${id}". Styles: ${Object.keys(STYLES).join(", ")}`);
  return s.make(ctx, t, m);
}
