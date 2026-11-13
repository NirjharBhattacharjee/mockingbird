export type CameraKey = { at: number; x: number; y: number; zoom: number };
export type ScreenMark = {
  kind: "blur" | "mask" | "spotlight" | "click" | "box" | "text";
  from: number;
  to: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  color?: string;
  size?: number;
  radius?: number;
};
export type ScreenOptions = {
  camera: CameraKey[];
  overlays: ScreenMark[];
  easing: "linear" | "smooth";
};

/** One source-pixel camera, also used by every source-anchored mark. */
export function cameraAt(keys: CameraKey[], t: number, easing: "linear" | "smooth") {
  const first = keys[0];
  if (!first) return undefined;
  if (t <= first.at) return first;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1] as CameraKey;
    const b = keys[i] as CameraKey;
    if (t > b.at) continue;
    let u = (t - a.at) / (b.at - a.at);
    if (easing === "smooth") u = u * u * u * (u * (6 * u - 15) + 10);
    return {
      at: t,
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * u),
    };
  }
  return keys.at(-1);
}

export function screenOptions(a: Record<string, unknown>): ScreenOptions {
  const finite = (v: unknown, label: string, min = 0, max = 1e6) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      throw new Error(`${label} must be a finite number from ${min} to ${max}`);
    return v;
  };
  if (a.camera !== undefined && !Array.isArray(a.camera))
    throw new Error("camera must be an array");
  if (a.overlays !== undefined && !Array.isArray(a.overlays))
    throw new Error("overlays must be an array");
  const camera = ((a.camera ?? []) as Record<string, unknown>[]).map((k, i) => {
    if (!k || typeof k !== "object") throw new Error(`camera[${i}] must be an object`);
    return {
      at: finite(k.at, "camera time", 0, 7200),
      x: finite(k.x, "camera x"),
      y: finite(k.y, "camera y"),
      zoom: finite(k.zoom, "camera zoom", 0.05, 20),
    };
  });
  if (camera.length > 200) throw new Error("Use at most 200 camera keys");
  for (let i = 1; i < camera.length; i++) {
    if ((camera[i]?.at ?? 0) <= (camera[i - 1]?.at ?? 0))
      throw new Error("Camera keys must have strictly increasing times");
  }
  const overlays = ((a.overlays ?? []) as Record<string, unknown>[]).map((m, i): ScreenMark => {
    if (!m || typeof m !== "object") throw new Error(`overlays[${i}] must be an object`);
    if (!["blur", "mask", "spotlight", "click", "box", "text"].includes(String(m.kind)))
      throw new Error(`overlays[${i}] has an unknown kind`);
    const from = finite(m.from, "overlay from", 0, 7200);
    const to = finite(m.to, "overlay to", 0, 7200);
    if (to <= from) throw new Error("Overlay to must follow from");
    const kind = m.kind as ScreenMark["kind"];
    const rect = ["blur", "mask", "spotlight", "box"].includes(kind);
    if (kind === "text" && (typeof m.text !== "string" || m.text.length > 1000))
      throw new Error("Text needs a string of at most 1000 characters");
    if (m.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(m.color)))
      throw new Error("color must be #RRGGBB");
    return {
      kind,
      from,
      to,
      x: finite(m.x, "overlay x"),
      y: finite(m.y, "overlay y"),
      ...(rect ? { w: finite(m.w, "overlay width", 1), h: finite(m.h, "overlay height", 1) } : {}),
      text: m.text as string | undefined,
      color: m.color as string | undefined,
      size: m.size === undefined ? 32 : finite(m.size, "text size", 8, 160),
      radius: m.radius === undefined ? 18 : finite(m.radius, "radius", 1, 200),
    };
  });
  if (overlays.length > 200) throw new Error("Use at most 200 overlays");
  if (a.easing !== undefined && !["linear", "smooth"].includes(String(a.easing)))
    throw new Error("easing must be linear or smooth");
  return { camera, overlays, easing: (a.easing ?? "smooth") as ScreenOptions["easing"] };
}

/** Literal data only; the page has no user-authored JavaScript or network input. */
export function screenPage(options: ScreenOptions) {
  const data = JSON.stringify(options).replaceAll("<", "\\u003c");
  return `<!doctype html><body style="margin:0"><canvas></canvas><script>
const config=${data};
const cameraAt=${cameraAt.toString()};
mockingbird.drawVideo=true;
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
mockingbird.draw=(t,m)=>{
  const W=canvas.width=m.width,H=canvas.height=m.height;
  if(!m.video)throw new Error('screen_render requires a video');
  const key=cameraAt(config.camera,t,config.easing)||{x:m.video.width/2,y:m.video.height/2,zoom:1};
  const scale=Math.min(W/m.video.width,H/m.video.height)*key.zoom;
  const px=x=>(x-key.x)*scale+W/2,py=y=>(y-key.y)*scale+H/2;
  ctx.fillStyle='#111111';ctx.fillRect(0,0,W,H);
  ctx.drawImage(m.video,px(0),py(0),m.video.width*scale,m.video.height*scale);
  const active=config.overlays.filter(o=>t>=o.from&&t<o.to);
  // Redactions precede decoration and text. They never fade at interval edges.
  for(const o of active.filter(o=>o.kind==='blur'||o.kind==='mask')){
    const x=px(o.x),y=py(o.y),w=o.w*scale,h=o.h*scale;
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    if(o.kind==='mask'){ctx.fillStyle=o.color||'#000000';ctx.fillRect(x,y,w,h);}
    else{ctx.filter='blur('+o.radius+'px)';
      ctx.drawImage(m.video,px(0),py(0),m.video.width*scale,m.video.height*scale);}
    ctx.restore();
  }
  for(const o of active.filter(o=>o.kind!=='blur'&&o.kind!=='mask')){
    ctx.save();const x=px(o.x),y=py(o.y),w=(o.w||0)*scale,h=(o.h||0)*scale;
    ctx.strokeStyle=o.color||'#ff397f';ctx.lineWidth=3;
    if(o.kind==='spotlight'){
      ctx.fillStyle='rgba(0,0,0,0.65)';ctx.beginPath();ctx.rect(0,0,W,H);ctx.rect(x,y,w,h);ctx.fill('evenodd');
    }else if(o.kind==='box'){ctx.strokeRect(x,y,w,h);}
    else if(o.kind==='click'){
      const age=(t-o.from)/(o.to-o.from);ctx.globalAlpha=1-age;
      ctx.beginPath();ctx.arc(x,y,8+o.radius*age,0,Math.PI*2);ctx.stroke();
    }else if(o.kind==='text'){
      ctx.font=o.size+'px system-ui';ctx.textBaseline='top';
      const lines=o.text.split('\\n');
      lines.forEach((line,i)=>{const y=o.y+i*o.size*1.3;
        ctx.fillStyle='rgba(0,0,0,0.8)';ctx.fillRect(o.x-8,y-4,ctx.measureText(line).width+16,o.size*1.3);
        ctx.fillStyle=o.color||'#ffffff';ctx.fillText(line,o.x,y);});
    }ctx.restore();
  }
};</script></body>`;
}
