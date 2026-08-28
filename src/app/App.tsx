import { useState, useEffect, useRef, useCallback, type MutableRefObject } from "react"
import Peer, { type DataConnection, type MediaConnection } from "peerjs"
import {
  FilesetResolver, PoseLandmarker, HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision"
import { downloadStrip } from "../lib/downloadStrip"
import {
  Camera, Download, Share2, RotateCcw, Check, Copy, X,
  Move, ChevronRight, ChevronLeft,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL CSS
// ─────────────────────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  @keyframes grain {
    0%,100%{ transform:translate(0,0) }
    10%{ transform:translate(-2%,-3%) }
    20%{ transform:translate(-5%,2%) }
    30%{ transform:translate(3%,-4%) }
    40%{ transform:translate(-3%,5%) }
    50%{ transform:translate(-5%,-5%) }
    60%{ transform:translate(4%,2%) }
    70%{ transform:translate(-3%,-3%) }
    80%{ transform:translate(2%,4%) }
    90%{ transform:translate(5%,-1%) }
  }
  @keyframes fadeInUp {
    from{ opacity:0; transform:translateY(22px) }
    to{ opacity:1; transform:translateY(0) }
  }
  @keyframes scaleIn {
    from{ opacity:0; transform:scale(0.93) }
    to{ opacity:1; transform:scale(1) }
  }
  @keyframes countdownPop {
    0%{ transform:scale(2.2) rotate(-6deg); opacity:0 }
    25%{ transform:scale(1) rotate(0deg); opacity:1 }
    75%{ transform:scale(1) rotate(0deg); opacity:1 }
    100%{ transform:scale(0.55) rotate(4deg); opacity:0 }
  }
  @keyframes flashOut {
    0%{ opacity:1 }
    100%{ opacity:0 }
  }
  @keyframes stripSlide {
    0%{ transform:translateY(112%); opacity:0 }
    100%{ transform:translateY(0); opacity:1 }
  }
  @keyframes developing {
    0%{ filter:brightness(0.07) saturate(0) }
    35%{ filter:brightness(0.22) saturate(0.18) sepia(0.7) }
    70%{ filter:brightness(0.72) saturate(0.55) sepia(0.15) }
    100%{ filter:brightness(1) saturate(1) }
  }
  @keyframes float {
    0%,100%{ transform:translateY(0px) rotate(var(--rot,0deg)) }
    50%{ transform:translateY(-10px) rotate(var(--rot,0deg)) }
  }
  @keyframes heartbeat {
    0%,100%{ transform:scale(1) }
    14%{ transform:scale(1.18) }
    28%{ transform:scale(1) }
    42%{ transform:scale(1.12) }
    70%{ transform:scale(1) }
  }
  @keyframes blink {
    0%,100%{ opacity:1 }
    50%{ opacity:0.2 }
  }
  @keyframes neonPulse {
    0%,100%{ text-shadow:0 0 8px currentColor,0 0 20px currentColor }
    50%{ text-shadow:0 0 16px currentColor,0 0 40px currentColor,0 0 60px currentColor }
  }
  @keyframes shimmerBar {
    0%{ background-position:-200% 0 }
    100%{ background-position:200% 0 }
  }

  .grain-overlay {
    position:absolute;
    inset:-50%;
    width:200%;
    height:200%;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='280'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.74' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='280' height='280' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E");
    animation:grain 0.38s steps(1) infinite;
    pointer-events:none;
    z-index:100;
    opacity:0.55;
    mix-blend-mode:multiply;
  }

  .screen-enter { animation:fadeInUp 0.42s cubic-bezier(0.22,1,0.36,1) both; }

  input[type=range]{ -webkit-appearance:none; appearance:none; height:4px; border-radius:2px; outline:none; cursor:pointer; }
  input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:var(--thumb-color,#C85B82); cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.2); }

  ::-webkit-scrollbar{ width:4px; height:4px; }
  ::-webkit-scrollbar-track{ background:transparent; }
  ::-webkit-scrollbar-thumb{ background:rgba(200,91,130,0.3); border-radius:4px; }

  * { box-sizing:border-box; }
`

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Screen = "landing"|"room"|"layout"|"theme"|"ready"|"booth"|"select"|"customize"|"reveal"
type Layout  = "classic"|"wide"
type ThemeId = "classic"|"washer"|"elevator"
type PropId = "none"|"glasses"|"partyHat"|"catEars"
type SkinSmoothing = 0|1|2
type ParticipantId = "p1"|"p2"
type FilterId = "none"|"warm"|"cool"|"film"|"bw"|"vivid"

type SyncMessage =
  | { type:"STATE"; screen:Screen; layout:Layout; themeId:ThemeId; propId:PropId }
  | { type:"BEAUTY"; strength:SkinSmoothing }
  | { type:"FRONT"; participant:ParticipantId }
  | { type:"CAPTURE"; at:number }

interface StickerItem { id:string; emoji:string; x:number; y:number; rot:number }

interface CustomizeOpts {
  frameColor:string
  filter:FilterId
  stickers:StickerItem[]
  name1:string
  name2:string
  date:string
  offsets:Record<number,{x:number;y:number}>
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const THEMES: {
  id:ThemeId; name:string; emoji:string; tagline:string;
  previewBg:string; dark:boolean; accent:string
}[] = [
  { id:"classic",  name:"Classic Plain",emoji:"✦",   tagline:"The original clean booth",   previewBg:"linear-gradient(160deg,#ffffff,#dceeff)", dark:false, accent:"#C85B82" },
  { id:"washer",   name:"Washer POV",    emoji:"◌",   tagline:"Soft blue laundry-day dream", previewBg:"radial-gradient(circle,transparent 40%,rgba(214,238,247,.72) 68%),url('/theme-assets/laundromat-neutral-blue-v3.png') center/cover", dark:false, accent:"#84B9CF" },
  { id:"elevator", name:"Elevator CCTV", emoji:"REC", tagline:"Cute corner-camera set", previewBg:"linear-gradient(rgba(255,245,249,.04),rgba(255,245,249,.04)),url('/theme-assets/elevator-cctv-cute.jpg') center/cover", dark:false, accent:"#E99ABC" },
]

const PROPS:{id:PropId;name:string;emoji:string;tagline:string}[]=[
  {id:"none",name:"No filter",emoji:"○",tagline:"Keep it natural"},
  {id:"glasses",name:"XHS Heart Glow",emoji:"♡",tagline:"Glossy hearts and soft highlights"},
  {id:"partyHat",name:"Douyin Star Halo",emoji:"✦",tagline:"Floating stars with camera glow"},
  {id:"catEars",name:"XMM Sticker Shuffle",emoji:"▦",tagline:"Cycling pixel catfish stickers"},
]

const THEME_IMAGE_PATHS:Partial<Record<ThemeId,string>>={
  washer:"/theme-assets/laundromat-neutral-blue-v3.png",
  elevator:"/theme-assets/elevator-cctv-cute.jpg",
}
const WASHER_RIM_IMAGE_PATH="/theme-assets/washer-rim-neutral-blue-v3.png"
const themeImageCache=new Map<string,HTMLImageElement>()

async function createLocalDemoStream(participant:ParticipantId,poseSet="full",moving=false):Promise<MediaStream>{
  const image=new Image()
  image.decoding="async"
  image.src=poseSet==="upper"?`/local-demo/${participant}-upper.png`:`/local-demo/${participant}.png`
  await image.decode()
  const canvas=document.createElement("canvas")
  canvas.width=1280;canvas.height=720
  const ctx=canvas.getContext("2d")!
  const draw=()=>{
    ctx.fillStyle="#dfe8ee";ctx.fillRect(0,0,canvas.width,canvas.height)
    const phase=(performance.now()/900)+(participant==="p2"?Math.PI:0)
    const dx=moving?Math.sin(phase)*72:0,dy=moving?Math.cos(phase*.8)*18:0
    const angle=moving?Math.sin(phase*.65)*.022:0
    ctx.save();ctx.translate(canvas.width/2+dx,canvas.height/2+dy);ctx.rotate(angle)
    ctx.drawImage(image,-canvas.width/2,-canvas.height/2,canvas.width,canvas.height);ctx.restore()
  }
  draw()
  const timer=window.setInterval(draw,1000/15)
  const stream=canvas.captureStream(15)
  stream.getVideoTracks().forEach(track=>track.addEventListener("ended",()=>window.clearInterval(timer),{once:true}))
  return stream
}

const FILTERS: { id:FilterId; name:string; css:string }[] = [
  { id:"none",  name:"Natural", css:"none" },
  { id:"warm",  name:"Warm",    css:"brightness(1.06) saturate(1.3) hue-rotate(-8deg)" },
  { id:"cool",  name:"Cool",    css:"brightness(1.02) saturate(0.85) hue-rotate(15deg)" },
  { id:"film",  name:"Film",    css:"contrast(1.18) brightness(0.93) saturate(0.78)" },
  { id:"bw",    name:"B&W",     css:"saturate(0) contrast(1.15) brightness(1.05)" },
  { id:"vivid", name:"Vivid",   css:"saturate(1.5) contrast(1.1) brightness(1.06)" },
]

const FRAME_COLORS = [
  { label:"White",    v:"#ffffff" },
  { label:"Cream",    v:"#fdf8ee" },
  { label:"Blush",    v:"#fce4ec" },
  { label:"Lavender", v:"#f3e5f5" },
  { label:"Sky",      v:"#e3f2fd" },
  { label:"Mint",     v:"#e8f5e9" },
  { label:"Peach",    v:"#fff3e0" },
  { label:"Dark",     v:"#1a1a1a" },
]

const STICKER_EMOJIS = [
  "🌸","💕","✨","🌙","⭐","💫","🍀","🎀",
  "💝","🌺","🦋","🌈","🍓","🍡","🎐","🌻",
  "💌","🪷","🌷","💗","🫶","🤍","💎","🎑",
  "🐾","🍰","☁️","🌊","🍵","🎋",
]

const TIPS = [
  "Face a window — natural light is the most flattering",
  "Hold your camera at eye level for the best angle",
  "A plain or soft background helps you shine",
  "Make eye contact with the lens, not the screen",
  "Try different expressions: playful, tender, surprised!",
]

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────

const genCode = (): string => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length:6 }, () => c[Math.floor(Math.random()*c.length)]).join("")
}

const fmtDate = (d:Date) =>
  d.toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" })

const uid = () => Math.random().toString(36).slice(2,9)

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function rRect(ctx:CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number) {
  if (typeof (ctx as any).roundRect === "function") {
    (ctx as any).roundRect(x,y,w,h,r)
  } else {
    ctx.rect(x,y,w,h)
  }
}

function mkLinear(ctx:CanvasRenderingContext2D, x0:number,y0:number,x1:number,y1:number, stops:[number,string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0,y0,x1,y1)
  stops.forEach(([s,c])=>g.addColorStop(s,c))
  return g
}

function getCachedImage(src:string|undefined) {
  if(!src||typeof Image==="undefined") return null
  let image=themeImageCache.get(src)
  if(!image){
    image=new Image()
    image.decoding="async"
    image.src=src
    themeImageCache.set(src,image)
  }
  return image
}

function getThemeImage(id:ThemeId) {
  return getCachedImage(THEME_IMAGE_PATHS[id])
}

function drawCoverImage(ctx:CanvasRenderingContext2D,image:HTMLImageElement,W:number,H:number) {
  const scale=Math.max(W/image.naturalWidth,H/image.naturalHeight)
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale
  ctx.drawImage(image,(W-width)/2,(H-height)/2,width,height)
}

function washerOpening(W:number,H:number) {
  return {x:W*.5,y:H*.5,r:Math.min(W*.34,H*.43)}
}

function drawThemeBg(ctx:CanvasRenderingContext2D, id:ThemeId, W:number, H:number) {
  const image=getThemeImage(id)
  if(image?.complete&&image.naturalWidth){
    drawCoverImage(ctx,image,W,H)
    if(id==="washer"){
      const depth=ctx.createRadialGradient(W*.5,H*.48,0,W*.5,H*.5,H*.7)
      depth.addColorStop(0,"rgba(255,255,255,.04)");depth.addColorStop(.68,"rgba(222,241,247,.05)");depth.addColorStop(1,"rgba(143,194,213,.18)")
      ctx.fillStyle=depth;ctx.fillRect(0,0,W,H)
    }
    if(id==="elevator"){
      ctx.fillStyle="rgba(255,245,249,.035)";ctx.fillRect(0,0,W,H)
    }
    return
  }
  switch(id) {
    case "classic":  ctx.fillStyle = mkLinear(ctx,0,0,W,H,[[0,"#ffffff"],[0.5,"#edf7ff"],[1,"#dceeff"]]); break
    case "washer":   ctx.fillStyle = mkLinear(ctx,0,0,W,H,[[0,"#dce7e7"],[0.55,"#f4f1e9"],[1,"#d5dcda"]]); break
    case "elevator": ctx.fillStyle = mkLinear(ctx,0,0,W,0,[[0,"#747d80"],[0.18,"#c7cdcd"],[0.5,"#eef0ef"],[0.82,"#c4caca"],[1,"#747d80"]]); break
  }
  ctx.fillRect(0,0,W,H)
}

function drawThemeDetails(ctx:CanvasRenderingContext2D,id:ThemeId,W:number,H:number) {
  if(id!=="classic") return
  const glow=ctx.createRadialGradient(W/2,H*.34,0,W/2,H*.34,W*.56)
  glow.addColorStop(0,"rgba(255,255,255,.78)")
  glow.addColorStop(1,"rgba(255,255,255,0)")
  ctx.fillStyle=glow;ctx.fillRect(0,0,W,H)
  const floor=ctx.createLinearGradient(0,H*.76,0,H)
  floor.addColorStop(0,"rgba(184,213,235,0)")
  floor.addColorStop(1,"rgba(184,213,235,.22)")
  ctx.fillStyle=floor;ctx.fillRect(0,H*.76,W,H*.24)
}

function drawWasherForeground(ctx:CanvasRenderingContext2D,W:number,H:number) {
  const image=getCachedImage(WASHER_RIM_IMAGE_PATH),opening=washerOpening(W,H)
  // Keep the inside-the-door viewpoint, but use a bright pearly tunnel instead
  // of the heavy black drum treatment used by an industrial washer.
  const tunnel=ctx.createRadialGradient(opening.x,opening.y,opening.r*.84,opening.x,opening.y,Math.max(W,H)*.68)
  tunnel.addColorStop(0,"rgba(255,255,255,0)")
  tunnel.addColorStop(.24,"rgba(218,239,247,.58)")
  tunnel.addColorStop(.62,"rgba(250,249,242,.96)")
  tunnel.addColorStop(1,"rgba(214,235,244,1)")
  ctx.fillStyle=tunnel;ctx.fillRect(0,0,W,H)
  if(image?.complete&&image.naturalWidth){
    ctx.save()
    ctx.beginPath();ctx.rect(0,0,W,H);ctx.ellipse(opening.x,opening.y,opening.r,opening.r,0,0,Math.PI*2)
    ctx.clip("evenodd")
    ctx.globalAlpha=.92
    const scale=Math.max(W/image.naturalWidth,H/image.naturalHeight)*1.28
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale
    ctx.drawImage(image,(W-width)/2,(H-height)/2,width,height)
    ctx.globalCompositeOperation="screen";ctx.fillStyle="rgba(215,241,248,.2)";ctx.fillRect(0,0,W,H)
    ctx.restore()
  }
  const gasket=ctx.createRadialGradient(opening.x-opening.r*.25,opening.y-opening.r*.3,opening.r*.45,opening.x,opening.y,opening.r*1.04)
  gasket.addColorStop(.78,"rgba(255,255,255,0)")
  gasket.addColorStop(.86,"rgba(170,213,229,.58)")
  gasket.addColorStop(.94,"rgba(255,244,238,.88)")
  gasket.addColorStop(1,"rgba(126,180,203,.88)")
  ctx.fillStyle=gasket;ctx.beginPath();ctx.arc(opening.x,opening.y,opening.r*1.055,0,Math.PI*2);ctx.fill()
  ctx.strokeStyle="rgba(102,164,190,.38)";ctx.lineWidth=Math.max(4,W*.008)
  ctx.beginPath();ctx.arc(opening.x,opening.y,opening.r*1.01,0,Math.PI*2);ctx.stroke()
  ctx.strokeStyle="rgba(255,255,255,.86)";ctx.lineWidth=3
  ctx.beginPath();ctx.arc(opening.x,opening.y,opening.r*.98,Math.PI*1.08,Math.PI*1.72);ctx.stroke()
  ctx.fillStyle="rgba(255,255,255,.42)"
  for(let ring=1.18;ring<1.68;ring+=.16){
    const count=34
    for(let i=0;i<count;i++){
      const angle=i/count*Math.PI*2
      const radius=opening.r*ring
      ctx.beginPath();ctx.arc(opening.x+Math.cos(angle)*radius,opening.y+Math.sin(angle)*radius,1.25,0,Math.PI*2);ctx.fill()
    }
  }
  ;[[.12,.18,5],[.86,.22,7],[.1,.78,8],[.9,.72,4]].forEach(([x,y,r])=>{
    ctx.fillStyle="rgba(255,255,255,.38)";ctx.strokeStyle="rgba(117,184,208,.44)";ctx.lineWidth=1.5
    ctx.beginPath();ctx.arc(W*x,H*y,r,0,Math.PI*2);ctx.fill();ctx.stroke()
  })
  drawVignette(ctx,W,H,.07)
}

function drawElevatorCctv(ctx:CanvasRenderingContext2D,W:number,H:number) {
  ctx.fillStyle="rgba(255,244,248,.035)";ctx.fillRect(0,0,W,H)
  ctx.fillStyle="rgba(79,52,72,.035)"
  for(let y=0;y<H;y+=4)ctx.fillRect(0,y,W,1)

  ctx.strokeStyle="rgba(255,255,255,.72)";ctx.lineWidth=2
  const corner=24,pad=16
  ;[[pad,pad,1,1],[W-pad,pad,-1,1],[pad,H-pad,1,-1],[W-pad,H-pad,-1,-1]].forEach(([x,y,dx,dy])=>{
    ctx.beginPath();ctx.moveTo(x+dx*corner,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*corner);ctx.stroke()
  })

  ctx.fillStyle="rgba(75,47,68,.58)";ctx.fillRect(0,H-36,W,36)
  ctx.font="700 12px monospace";ctx.textAlign="left";ctx.fillStyle="#fff7fb"
  const stamp=new Date().toLocaleString("en-US",{hour12:false})
  ctx.fillText(`CAM 03  ·  ${stamp}`,14,H-13)
  ctx.textAlign="right";ctx.fillText("PHOTO LIFT",W-14,H-13)
  ctx.textAlign="left";ctx.font="700 11px monospace";ctx.fillStyle="rgba(91,58,80,.72)";ctx.fillText("LEVEL ♡  ·  CH 03",16,29)
  ctx.fillStyle="#ef7fae";ctx.beginPath();ctx.arc(W-24,24,6,0,Math.PI*2);ctx.fill()
  ctx.textAlign="right";ctx.fillStyle="rgba(91,58,80,.76)";ctx.fillText("REC",W-38,28)
  drawVignette(ctx,W,H,.16)
}

function drawVignette(ctx:CanvasRenderingContext2D, W:number, H:number, strength=0.3) {
  const g = ctx.createRadialGradient(W/2,H/2,H*.15,W/2,H/2,H*.88)
  g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,`rgba(0,0,0,${strength})`)
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H)
}

type PersonBounds={ x:number; y:number; width:number; height:number }

function renderLandmarkSupport(
  supportCanvas:HTMLCanvasElement,
  pose:NormalizedLandmark[],
  hands:NormalizedLandmark[][]
) {
  const ctx=supportCanvas.getContext("2d")!
  const point=(landmark:NormalizedLandmark)=>({x:landmark.x*supportCanvas.width,y:landmark.y*supportCanvas.height})
  ctx.clearRect(0,0,supportCanvas.width,supportCanvas.height)
  ctx.save()
  ctx.globalCompositeOperation="source-over"
  ctx.lineCap="round"; ctx.lineJoin="round"
  ctx.filter="blur(1.2px)"

  // Reinforce arms through the pose skeleton so fast elbow and wrist movement
  // stays attached to the body segmentation mask.
  ctx.strokeStyle="rgba(255,255,255,.72)"
  ctx.lineWidth=Math.max(6,supportCanvas.width*.025)
  ;[[11,13],[13,15],[12,14],[14,16]].forEach(([start,end])=>{
    const a=pose[start], b=pose[end]
    if(!a||!b||a.visibility<.5||b.visibility<.5) return
    const from=point(a), to=point(b)
    ctx.beginPath(); ctx.moveTo(from.x,from.y); ctx.lineTo(to.x,to.y); ctx.stroke()
  })

  // Hand Landmarker provides 21 points per hand. Fill the palm and connect all
  // finger bones, then union the soft result into the body matte.
  ctx.strokeStyle="rgba(255,255,255,.9)"
  ctx.fillStyle="rgba(255,255,255,.86)"
  ctx.lineWidth=Math.max(3,supportCanvas.width*.009)
  hands.forEach(hand=>{
    const palm=[0,5,9,13,17].map(index=>hand[index]).filter(Boolean)
    if(palm.length===5){
      const first=point(palm[0]); ctx.beginPath(); ctx.moveTo(first.x,first.y)
      palm.slice(1).forEach(landmark=>{ const p=point(landmark); ctx.lineTo(p.x,p.y) })
      ctx.closePath(); ctx.fill()
    }
    HandLandmarker.HAND_CONNECTIONS.forEach(({start,end})=>{
      const a=hand[start], b=hand[end]
      if(!a||!b) return
      const from=point(a), to=point(b)
      ctx.beginPath(); ctx.moveTo(from.x,from.y); ctx.lineTo(to.x,to.y); ctx.stroke()
    })
    hand.forEach(landmark=>{
      const p=point(landmark)
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(2.5,supportCanvas.width*.006),0,Math.PI*2); ctx.fill()
    })
  })
  ctx.restore()
}

function boundsFromTracking(
  pose:NormalizedLandmark[],
  hands:NormalizedLandmark[][],
  fallback:PersonBounds|null,
  maskAlpha?:Uint8ClampedArray,
  maskWidth?:number,
  maskHeight?:number,
):PersonBounds|null {
  const points=[
    ...pose.filter(landmark=>landmark.visibility>.22),
    ...hands.flat(),
  ].filter(landmark=>Number.isFinite(landmark.x)&&Number.isFinite(landmark.y))
  let minX=points.length?Math.min(...points.map(point=>point.x)):1
  let maxX=points.length?Math.max(...points.map(point=>point.x)):0
  let minY=points.length?Math.min(...points.map(point=>point.y)):1
  let maxY=points.length?Math.max(...points.map(point=>point.y)):0

  // The matte includes hair and clothing that pose points do not. Deriving the
  // fit rectangle from both signals keeps the whole person while discarding
  // empty webcam wall that previously made people look miniature.
  if(maskAlpha&&maskWidth&&maskHeight){
    let maskMinX=maskWidth,maskMaxX=-1,maskMinY=maskHeight,maskMaxY=-1
    for(let y=0;y<maskHeight;y+=2) for(let x=0;x<maskWidth;x+=2){
      if(maskAlpha[(y*maskWidth+x)*4+3]<42) continue
      maskMinX=Math.min(maskMinX,x);maskMaxX=Math.max(maskMaxX,x)
      maskMinY=Math.min(maskMinY,y);maskMaxY=Math.max(maskMaxY,y)
    }
    if(maskMaxX>=0){
      minX=Math.min(minX,maskMinX/maskWidth);maxX=Math.max(maxX,(maskMaxX+1)/maskWidth)
      minY=Math.min(minY,maskMinY/maskHeight);maxY=Math.max(maxY,(maskMaxY+1)/maskHeight)
    }
  }
  if(maxX<=minX||maxY<=minY) return fallback
  const rawW=Math.max(.1,maxX-minX),rawH=Math.max(.1,maxY-minY)
  const paddedMinY=minY-.14,paddedMaxY=maxY+.07
  const width=Math.min(1,Math.max(.34,rawW+.12))
  const height=Math.min(1,Math.max(.55,paddedMaxY-paddedMinY))
  const centerX=(minX+maxX)/2,centerY=(paddedMinY+paddedMaxY)/2
  const next={
    x:Math.max(0,Math.min(1-width,centerX-width/2)),
    y:Math.max(0,Math.min(1-height,centerY-height/2)),
    width,height,
  }
  if(!fallback) return next
  return {
    x:fallback.x*.72+next.x*.28,
    y:fallback.y*.72+next.y*.28,
    width:fallback.width*.72+next.width*.28,
    height:fallback.height*.72+next.height*.28,
  }
}

function drawTrackedProp(
  ctx:CanvasRenderingContext2D,
  propId:PropId,
  pose:NormalizedLandmark[],
  tracked:PersonBounds,
  drawX:number,drawY:number,drawW:number,drawH:number
) {
  if(propId==="none") return
  const leftEye=pose[2],rightEye=pose[5]
  if(!leftEye||!rightEye||(leftEye.visibility??1)<.35||(rightEye.visibility??1)<.35) return
  const point=(landmark:NormalizedLandmark)=>({
    x:drawX+((landmark.x-tracked.x)/tracked.width)*drawW,
    y:drawY+((landmark.y-tracked.y)/tracked.height)*drawH,
  })
  const left=point(leftEye),right=point(rightEye)
  const dx=right.x-left.x,dy=right.y-left.y
  const eyeDistance=Math.hypot(dx,dy)
  if(!Number.isFinite(eyeDistance)||eyeDistance<5) return
  const centerX=(left.x+right.x)/2,centerY=(left.y+right.y)/2
  // Pose landmarks may arrive with the eye vector pointing right-to-left.
  // Normalize it to an upright half-turn so crowns and ears never flip below
  // the face while still following natural head tilt.
  let angle=Math.atan2(dy,dx)
  if(angle>Math.PI/2) angle-=Math.PI
  if(angle<-Math.PI/2) angle+=Math.PI

  ctx.save();ctx.translate(centerX,centerY);ctx.rotate(angle)
  ctx.imageSmoothingEnabled=true;ctx.lineCap="round";ctx.lineJoin="round"
  ctx.shadowColor="rgba(196,104,151,.22)";ctx.shadowBlur=eyeDistance*.18
  const heart=(x:number,y:number,size:number,fill:string,stroke="rgba(255,255,255,.9)")=>{
    ctx.save();ctx.translate(x,y);ctx.scale(size/24,size/24)
    ctx.beginPath();ctx.moveTo(0,8);ctx.bezierCurveTo(-17,-2,-11,-14,-3,-10);ctx.bezierCurveTo(0,-8,1,-5,0,-2);ctx.bezierCurveTo(-1,-5,0,-8,3,-10);ctx.bezierCurveTo(11,-14,17,-2,0,8)
    ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.8;ctx.stroke();ctx.restore()
  }
  const sparkle=(x:number,y:number,size:number,color:string)=>{
    ctx.beginPath();ctx.moveTo(x,y-size);ctx.quadraticCurveTo(x+size*.2,y-size*.2,x+size,y);ctx.quadraticCurveTo(x+size*.2,y+size*.2,x,y+size);ctx.quadraticCurveTo(x-size*.2,y+size*.2,x-size,y);ctx.quadraticCurveTo(x-size*.2,y-size*.2,x,y-size);ctx.fillStyle=color;ctx.fill()
  }
  if(propId==="glasses"){
    const lensW=eyeDistance*.92,lensH=eyeDistance*.62
    ;[-1,1].forEach(side=>{
      const cx=side*eyeDistance*.53
      const lens=ctx.createLinearGradient(cx-lensW/2,-lensH/2,cx+lensW/2,lensH/2)
      lens.addColorStop(0,"rgba(255,205,228,.92)");lens.addColorStop(.55,"rgba(164,236,245,.64)");lens.addColorStop(1,"rgba(255,255,255,.3)")
      ctx.beginPath();ctx.ellipse(cx,0,lensW*.55,lensH*.5,0,0,Math.PI*2);ctx.fillStyle=lens;ctx.fill();ctx.strokeStyle="#fff7fb";ctx.lineWidth=Math.max(2,eyeDistance*.07);ctx.stroke()
      heart(cx+side*lensW*.42,-lensH*.5,eyeDistance*.34,"#ff8fbd")
    })
    ctx.beginPath();ctx.moveTo(-eyeDistance*.12,0);ctx.lineTo(eyeDistance*.12,0);ctx.strokeStyle="#fff7fb";ctx.lineWidth=Math.max(2,eyeDistance*.07);ctx.stroke()
    sparkle(eyeDistance*1.32,-eyeDistance*.68,eyeDistance*.18,"#fff")
  }
  if(propId==="partyHat"){
    const colors=["#ff9fc8","#8fe5f2","#ffe69a"]
    ;[-.72,0,.72].forEach((side,index)=>{
      const y=-eyeDistance*(index===1?1.42:1.08),size=eyeDistance*(index===1?.38:.28)
      sparkle(side*eyeDistance,y,size,colors[index]);sparkle(side*eyeDistance,y,size*.48,"#fff")
    })
    ctx.beginPath();ctx.arc(0,-eyeDistance*.78,eyeDistance*.98,Math.PI*1.12,Math.PI*1.88)
    ctx.strokeStyle="rgba(255,255,255,.78)";ctx.lineWidth=Math.max(2,eyeDistance*.045);ctx.stroke()
    ;[-1.18,1.18].forEach(side=>sparkle(side*eyeDistance,-eyeDistance*.48,eyeDistance*.13,"rgba(255,255,255,.9)"))
  }
  if(propId==="catEars"){
    // XMM references use deliberately crunchy, early-web pixel stickers and
    // cycle combinations instead of holding one polished accessory forever.
    ctx.shadowBlur=0;ctx.imageSmoothingEnabled=false
    const p=Math.max(3,Math.round(eyeDistance*.095))
    const block=(x:number,y:number,w:number,h:number,color:string)=>{
      ctx.fillStyle=color;ctx.fillRect(Math.round(x/p)*p,Math.round(y/p)*p,Math.max(p,Math.round(w/p)*p),Math.max(p,Math.round(h/p)*p))
    }
    const rows=(pattern:string[],x:number,y:number,color:string,scale=1)=>pattern.forEach((row,ry)=>[...row].forEach((cell,rx)=>{
      if(cell!=="0") block(x+(rx-row.length/2)*p*scale,y+ry*p*scale,p*scale,p*scale,cell==="2"?"#fff7f2":cell==="3"?"#ff76b4":color)
    }))
    const ears=()=>[-1,1].forEach(side=>{
      const x=side*eyeDistance*.72
      rows(["00100","01110","11211","11111"],x,-eyeDistance*1.15,"#17131e",.9)
    })
    const nose=()=>rows(["01110","12221","01110"],0,eyeDistance*.45,"#2a202d",.75)
    const phase=Math.floor(Date.now()/1650)%5
    if(phase===0){
      ears();nose()
      // Pixel bone sits diagonally beside the chin, matching the playful dog
      // sticker combinations in the references.
      ctx.save();ctx.translate(eyeDistance*.72,eyeDistance*.62);ctx.rotate(-.62)
      rows(["110011","111111","001100","001100","111111","110011"],0,0,"#fff7f2",.72);ctx.restore()
    } else if(phase===1){
      // Oversized moustache plus a small bow—the intentionally silly
      // "catfish" disguise shown across the still and video references.
      rows(["100000001","110000011","111000111","111111111","011111110","001111100"],0,eyeDistance*.55,"#111018",.82)
      rows(["110011","111111","011110","001100"],eyeDistance*.72,-eyeDistance*1.2,"#ff5ca8",.86)
      block(eyeDistance*.72-p*.45,-eyeDistance*1.2+p*1.1,p*.9,p*.9,"#fff")
    } else if(phase===2) {
      ears();nose()
      // Chunky round glasses with white lenses and black pixel outlines.
      ;[-1,1].forEach(side=>{
        const x=side*eyeDistance*.52
        rows(["01110","12221","12221","12221","01110"],x,-eyeDistance*.28,"#1b1621",.76)
      })
      block(-eyeDistance*.12,-eyeDistance*.05,eyeDistance*.24,p,"#1b1621")
    } else if(phase===3) {
      // Soft bear ears and a tiny toast-mouth sticker appeared repeatedly in
      // the newer references alongside otherwise minimal face decoration.
      ;[-1,1].forEach(side=>{
        const x=side*eyeDistance*.7
        rows(["01110","11211","11111","01110"],x,-eyeDistance*1.08,"#9b692f",.78)
        block(x-p*.45,-eyeDistance*.9,p*.9,p*.9,"#ffd93d")
      })
      rows(["011110","122221","123321","122221","011110"],0,eyeDistance*.55,"#b47a3c",.68)
      // Small side sticker keeps the deliberately busy Random Sticker feel.
      rows(["010","111","010"],-eyeDistance*1.22,-eyeDistance*.68,"#ff6da9",.55)
    } else {
      // Not every XMM phase is filled pixel art: the references also use a
      // single-color doodle outline with a few floating reaction stickers.
      ctx.strokeStyle="#ef657f";ctx.lineWidth=Math.max(2,p*.65);ctx.lineCap="square";ctx.lineJoin="miter"
      ctx.beginPath();ctx.moveTo(-eyeDistance*.78,-eyeDistance*.36);ctx.lineTo(-eyeDistance*.78,-eyeDistance*.86);ctx.lineTo(-eyeDistance*.45,-eyeDistance*.6);ctx.quadraticCurveTo(0,-eyeDistance*.82,eyeDistance*.45,-eyeDistance*.6);ctx.lineTo(eyeDistance*.78,-eyeDistance*.86);ctx.lineTo(eyeDistance*.78,-eyeDistance*.36);ctx.quadraticCurveTo(eyeDistance*.9,eyeDistance*.1,eyeDistance*.58,eyeDistance*.48);ctx.lineTo(eyeDistance*.92,eyeDistance*.58);ctx.moveTo(eyeDistance*.58,eyeDistance*.48);ctx.lineTo(eyeDistance*.82,eyeDistance*.82);ctx.moveTo(-eyeDistance*.72,eyeDistance*.15);ctx.lineTo(-eyeDistance*1.15,eyeDistance*.04);ctx.moveTo(-eyeDistance*.72,eyeDistance*.32);ctx.lineTo(-eyeDistance*1.16,eyeDistance*.42);ctx.stroke()
      rows(["0110","1111","0110","0010"],eyeDistance*1.12,-eyeDistance*.72,"#ff6da9",.5)
      rows(["010","111","010"],-eyeDistance*1.18,-eyeDistance*.84,"#ffe57d",.5)
    }
  }
  ctx.restore()
}

function smoothPoseLandmarks(previous:NormalizedLandmark[],next:NormalizedLandmark[],amount=.46){
  if(!previous.length||previous.length!==next.length) return next
  return next.map((landmark,index)=>{
    const before=previous[index]
    return {
      ...landmark,
      x:before.x+(landmark.x-before.x)*amount,
      y:before.y+(landmark.y-before.y)*amount,
      z:before.z+(landmark.z-before.z)*amount,
      visibility:(before.visibility??1)+((landmark.visibility??1)-(before.visibility??1))*amount,
    }
  })
}

function drawSkinSoftening(
  ctx:CanvasRenderingContext2D,
  scratch:HTMLCanvasElement,
  pose:NormalizedLandmark[],
  tracked:PersonBounds,
  drawX:number,drawY:number,drawW:number,drawH:number,
  strength:SkinSmoothing
) {
  if(strength===0) return
  const leftEye=pose[2],rightEye=pose[5]
  if(!leftEye||!rightEye||(leftEye.visibility??1)<.35||(rightEye.visibility??1)<.35) return
  const point=(landmark:NormalizedLandmark)=>({
    x:drawX+((landmark.x-tracked.x)/tracked.width)*drawW,
    y:drawY+((landmark.y-tracked.y)/tracked.height)*drawH,
  })
  const left=point(leftEye),right=point(rightEye)
  const eyeDistance=Math.hypot(right.x-left.x,right.y-left.y)
  if(!Number.isFinite(eyeDistance)||eyeDistance<5) return
  const angle=Math.atan2(right.y-left.y,right.x-left.x)
  const centerX=(left.x+right.x)/2
  const centerY=(left.y+right.y)/2+eyeDistance*.5
  const radiusX=eyeDistance*1.14
  const radiusY=eyeDistance*1.42

  // Follow social-camera retouching conventions: soften low-frequency skin
  // texture inside the face only, then restore high-detail eye and nose zones.
  // This keeps identity, glasses, expressions, and facial contours intact.
  ctx.save()
  ctx.beginPath();ctx.ellipse(centerX,centerY,radiusX,radiusY,0,0,Math.PI*2);ctx.clip()
  ctx.filter=`brightness(${strength===1?1.012:1.022}) saturate(${strength===1?.995:.985}) blur(${strength===1?1.65:2.75}px)`
  ctx.globalAlpha=strength===1?.2:.3
  ctx.drawImage(scratch,drawX,drawY,drawW,drawH,drawX,drawY,drawW,drawH)
  ctx.filter="none"
  const glow=ctx.createRadialGradient(centerX-eyeDistance*.2,centerY-eyeDistance*.35,0,centerX,centerY,radiusY)
  glow.addColorStop(0,`rgba(255,239,235,${strength===1?.055:.085})`)
  glow.addColorStop(1,"rgba(255,239,235,0)")
  ctx.globalAlpha=1;ctx.fillStyle=glow;ctx.fillRect(centerX-radiusX,centerY-radiusY,radiusX*2,radiusY*2)
  ctx.restore()

  // Repaint small facial-detail islands from the untouched frame. Keeping the
  // eyes and center features crisp avoids the waxy, whole-face blur look.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(left.x,left.y,eyeDistance*.38,eyeDistance*.24,angle,0,Math.PI*2)
  ctx.ellipse(right.x,right.y,eyeDistance*.38,eyeDistance*.24,angle,0,Math.PI*2)
  ctx.ellipse(centerX,centerY+eyeDistance*.26,eyeDistance*.3,eyeDistance*.4,angle,0,Math.PI*2)
  ctx.clip();ctx.globalAlpha=strength===1?.7:.62
  ctx.drawImage(scratch,drawX,drawY,drawW,drawH,drawX,drawY,drawW,drawH)
  ctx.restore()

  // Very restrained eye brilliance—localized highlights, not eye reshaping.
  ctx.save();ctx.globalAlpha=strength===1?.12:.2;ctx.fillStyle="#fff"
  ;[left,right].forEach(eye=>{ctx.beginPath();ctx.arc(eye.x-eyeDistance*.045,eye.y-eyeDistance*.04,Math.max(1,eyeDistance*.035),0,Math.PI*2);ctx.fill()})
  ctx.restore()
}

function drawPersonCutout(
  ctx:CanvasRenderingContext2D,
  video:HTMLVideoElement|HTMLCanvasElement,
  mask:HTMLCanvasElement,
  personBounds:PersonBounds|null,
  pose:NormalizedLandmark[],
  propId:PropId,
  skinSmoothing:SkinSmoothing,
  scratch:HTMLCanvasElement,
  x:number, y:number, width:number, height:number,
  mirrored=true,
  captureQuality=false,
) {
  if(scratch.width!==ctx.canvas.width) scratch.width=ctx.canvas.width
  if(scratch.height!==ctx.canvas.height) scratch.height=ctx.canvas.height
  const work=scratch.getContext("2d")!
  work.clearRect(0,0,scratch.width,scratch.height)
  const tracked=personBounds||{x:.08,y:.02,width:.84,height:.98}
  const sourceW=video instanceof HTMLVideoElement?video.videoWidth:video.width
  const sourceH=video instanceof HTMLVideoElement?video.videoHeight:video.height
  const sx=tracked.x*sourceW, sy=tracked.y*sourceH
  const sw=tracked.width*sourceW, sh=tracked.height*sourceH
  const scale=Math.min(width/sw,height/sh)
  const drawW=sw*scale, drawH=sh*scale
  const drawX=x+(width-drawW)/2, drawY=y+height-drawH
  work.drawImage(video,sx,sy,sw,sh,drawX,drawY,drawW,drawH)
  work.globalCompositeOperation="destination-in"
  work.drawImage(
    mask,
    tracked.x*mask.width,
    tracked.y*mask.height,
    tracked.width*mask.width,
    tracked.height*mask.height,
    drawX,drawY,drawW,drawH
  )
  work.globalCompositeOperation="source-over"

  ctx.save()
  // A heavy cutout shadow reads as a segmentation halo. Keep only a very
  // restrained live-preview lift and remove it completely in saved photos.
  ctx.shadowColor=captureQuality?"transparent":"rgba(46,25,43,.07)"
  ctx.shadowBlur=captureQuality?0:7
  ctx.shadowOffsetY=captureQuality?0:3
  if(mirrored){ ctx.translate(drawX*2+drawW,0); ctx.scale(-1,1) }
  ctx.drawImage(scratch,drawX,drawY,drawW,drawH,drawX,drawY,drawW,drawH)
  ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.shadowOffsetY=0
  drawSkinSoftening(ctx,scratch,pose,tracked,drawX,drawY,drawW,drawH,skinSmoothing)
  drawTrackedProp(ctx,propId,pose,tracked,drawX,drawY,drawW,drawH)
  ctx.restore()
}

function drawBoothFrame(
  ctx:CanvasRenderingContext2D,
  video:HTMLVideoElement,
  partnerVideo:HTMLVideoElement|null,
  W:number, H:number,
  themeId:ThemeId,
  propId:PropId,
  localSkinSmoothing:SkinSmoothing,
  partnerSkinSmoothing:SkinSmoothing,
  frontParticipant:ParticipantId,
  localParticipant:ParticipantId,
  proximity:number,
  localMask:HTMLCanvasElement|null,
  partnerMask:HTMLCanvasElement|null,
  localBounds:PersonBounds|null,
  partnerBounds:PersonBounds|null,
  localPose:NormalizedLandmark[],
  partnerPose:NormalizedLandmark[],
  localScratch:HTMLCanvasElement,
  partnerScratch:HTMLCanvasElement,
  localFrame:HTMLCanvasElement,
  partnerFrame:HTMLCanvasElement,
  captureQuality=false,
) {
  ctx.clearRect(0,0,W,H)
  drawThemeBg(ctx,themeId,W,H)
  drawThemeDetails(ctx,themeId,W,H)

  const pW=themeId==="washer"?W*.48:themeId==="elevator"?W*.42:W*.52
  // Circular themes need extra headroom inside the opening because the rim is
  // intentionally painted over the people after compositing.
  const pH=themeId==="washer"?H*.7:themeId==="elevator"?H*.76:H*.84
  const pY=themeId==="washer"?H*.16:themeId==="elevator"?H*.18:H*.08
  const maxGap=W*.01, minGap=-pW*.42
  const gap=maxGap-(proximity/100)*(maxGap-minGap)
  const youX=W/2-pW-gap/2
  const partX=W/2+gap/2

  if(themeId==="washer"){
    const opening=washerOpening(W,H)
    ctx.save();ctx.beginPath();ctx.arc(opening.x,opening.y,opening.r*.99,0,Math.PI*2);ctx.clip()
  }

  const localReady=video.readyState>=2&&localFrame.width>0&&Boolean(localMask)
  const partnerReady=Boolean(partnerVideo&&partnerVideo.readyState>=2&&partnerFrame.width>0&&partnerMask)
  const drawLocal=()=>{
    if(localReady&&localMask) drawPersonCutout(ctx,localFrame,localMask,localBounds,localPose,propId,localSkinSmoothing,localScratch,youX,pY,pW,pH,true,captureQuality)
  }
  const drawPartner=()=>{
    if(partnerReady&&partnerVideo&&partnerMask) drawPersonCutout(ctx,partnerFrame,partnerMask,partnerBounds,partnerPose,propId,partnerSkinSmoothing,partnerScratch,partX,pY,pW,pH,true,captureQuality)
  }
  if(partnerReady){
    const localIsFront=frontParticipant===localParticipant
    if(localIsFront){ drawPartner();drawLocal() } else { drawLocal();drawPartner() }
  }else{
    drawLocal()
      ctx.save(); ctx.beginPath(); rRect(ctx,partX,pY,pW,pH,8)
      ctx.fillStyle="rgba(255,255,255,.24)"; ctx.fill()
      ctx.setLineDash([8,8]); ctx.strokeStyle="rgba(255,255,255,.58)"; ctx.lineWidth=2; ctx.stroke()
      ctx.setLineDash([]); ctx.textAlign="center"; ctx.fillStyle="rgba(255,255,255,.92)"
      ctx.font="600 15px Nunito, sans-serif"; ctx.fillText(partnerVideo?"Isolating your partner…":"Waiting for your partner",partX+pW/2,pY+pH/2-5)
      ctx.font="500 11px Nunito, sans-serif"; ctx.fillStyle="rgba(255,255,255,.68)"
      ctx.fillText(partnerVideo?"Removing their room background":"Their live camera will appear here",partX+pW/2,pY+pH/2+17); ctx.restore()
  }

  if(themeId==="washer") ctx.restore()

  if(themeId==="washer") drawWasherForeground(ctx,W,H)
  else if(themeId==="elevator") drawElevatorCctv(ctx,W,H)
  else drawVignette(ctx,W,H,.2)
}

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE STRIP (landing decoration)
// ─────────────────────────────────────────────────────────────────────────────

function SampleStrip({
  gradients, label, date, wide=false, style
}: {
  gradients:string[]; label:string; date:string; wide?:boolean; style?:React.CSSProperties
}) {
  const W=wide?192:124, cols=wide?2:1, rows=wide?3:4, pH=wide?50:56
  return (
    <div style={{ width:W, background:"#fff", borderRadius:7, boxShadow:"0 14px 42px rgba(0,0,0,0.17)", overflow:"hidden", flexShrink:0, ...style }}>
      <div style={{ height:26, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:8, letterSpacing:"0.22em", color:"#C85B82", fontFamily:"Nunito,sans-serif", fontWeight:700 }}>duet ♡</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gap:4, padding:"0 6px" }}>
        {Array.from({length:rows*cols},(_,i)=>(
          <div key={i} style={{ backgroundImage:"url('/couple.png')", backgroundSize:"cover", backgroundPosition:`${38+(i%3)*10}% ${42+(i%2)*8}%`, filter:i%3===0?"sepia(.12) saturate(.82)":i%3===1?"brightness(1.04) saturate(.9)":"contrast(1.04) saturate(.76)", height:pH, borderRadius:3 }} />
        ))}
      </div>
      <div style={{ height:30, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2 }}>
        <span style={{ fontSize:10, color:"#9B7B90", fontFamily:"'Dancing Script',cursive" }}>{label}</span>
        <span style={{ fontSize:8, color:"#ccc", fontFamily:"Nunito,sans-serif" }}>{date}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDING SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function LandingScreen({ onStart }:{ onStart:(roomCode?:string)=>void }) {
  const [joinCode, setJoinCode] = useState("")

  const s1=["linear-gradient(135deg,#fce4ec,#e1bee7)","linear-gradient(135deg,#e8f5e9,#b2ebf2)","linear-gradient(135deg,#fff9c4,#ffccbc)","linear-gradient(135deg,#f3e5f5,#fce4ec)"]
  const s2=["linear-gradient(135deg,#e3f2fd,#bbdefb)","linear-gradient(135deg,#fff8e1,#ffecb3)","linear-gradient(135deg,#fce4ec,#f3e5f5)","linear-gradient(135deg,#e8f5e9,#e3f2fd)"]
  const s3=["linear-gradient(135deg,#fce4ec,#fff9c4)","linear-gradient(135deg,#e3f2fd,#e1bee7)","linear-gradient(135deg,#f3e5f5,#fce4ec)","linear-gradient(135deg,#fff8e1,#e8f5e9)","linear-gradient(135deg,#e3f2fd,#bbdefb)","linear-gradient(135deg,#fce4ec,#f3e5f5)"]

  return (
    <div style={{ position:"relative", minHeight:"100vh", overflow:"hidden", display:"flex", background:"#F7F1E7", fontFamily:"'Nunito',sans-serif" }}>
      <div className="grain-overlay" />

      {/* Floating strips — desktop */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none" }} className="md-strips">
        <div style={{ position:"absolute", left:"4%", top:"14%", "--rot":"-9deg" } as React.CSSProperties & Record<string,string>}>
          <SampleStrip gradients={s1} label="이지연 & 민준" date="2024.12.24" style={{ transform:"rotate(-9deg)", animation:"float 6s ease-in-out infinite" }} />
        </div>
        <div style={{ position:"absolute", left:"14%", top:"54%", "--rot":"5deg" } as React.CSSProperties & Record<string,string>}>
          <SampleStrip gradients={s2} label="Yuna & Kai" date="2025.01.14" style={{ transform:"rotate(5deg)", animation:"float 7.5s ease-in-out -2s infinite" }} />
        </div>
        <div style={{ position:"absolute", left:"2%", top:"74%", "--rot":"-4deg" } as React.CSSProperties & Record<string,string>}>
          <SampleStrip gradients={s3} label="Sora & Ren" date="2025.02.14" wide style={{ transform:"rotate(-4deg)", animation:"float 8s ease-in-out -4s infinite" }} />
        </div>
      </div>

      {/* Petal accents */}
      <div style={{ position:"absolute", top:32, right:48, fontSize:76, opacity:.13, pointerEvents:"none", animation:"float 5s ease-in-out infinite" }}>🌸</div>
      <div style={{ position:"absolute", bottom:80, right:24, fontSize:60, opacity:.09, pointerEvents:"none", animation:"float 7s ease-in-out -3s infinite" }}>✨</div>
      <div style={{ position:"absolute", top:"45%", right:"38%", fontSize:40, opacity:.07, pointerEvents:"none", animation:"float 9s ease-in-out -5s infinite" }}>💕</div>

      {/* Content */}
      <div style={{ position:"relative", zIndex:10, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", width:"100%", padding:"40px 24px" }}>

        {/* Left strips (always-visible layout aid, faded on mobile) */}
        <div style={{ display:"flex", gap:32, alignItems:"center", justifyContent:"center", width:"100%", maxWidth:980, flexWrap:"wrap" }}>

          {/* Strip showcase — hidden on small mobile, shown md+ */}
          <div style={{ display:"flex", gap:16, alignItems:"flex-end", opacity:.95 }}>
            <SampleStrip gradients={s1} label="이지연 & 민준" date="2024.12.24" style={{ transform:"rotate(-7deg)", animation:"float 6s ease-in-out infinite", marginBottom:16 }} />
            <SampleStrip gradients={s2} label="Yuna & Kai" date="2025.01.14" style={{ transform:"rotate(4deg)", animation:"float 7.5s ease-in-out -2s infinite" }} />
            <SampleStrip gradients={s3} label="Sora & Ren" date="2025.02.14" wide style={{ transform:"rotate(-3deg)", animation:"float 8.5s ease-in-out -4.5s infinite", marginBottom:8 }} />
          </div>

          {/* Main copy & CTA */}
          <div style={{ maxWidth:400, display:"flex", flexDirection:"column", alignItems:"flex-start", gap:0 }}>

            {/* Logo */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24 }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:"#EE6D8D", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, boxShadow:"0 4px 18px rgba(238,109,141,0.28)" }}>♡</div>
              <span style={{ fontFamily:"'Nunito',sans-serif", fontWeight:800, fontSize:21, color:"#2D1B2E", letterSpacing:"-0.03em" }}>duet</span>
            </div>

            <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:"clamp(2.1rem,5vw,3.4rem)", lineHeight:1.1, color:"#2D1B2E", marginBottom:16, margin:"0 0 16px 0" }}>
              Step into the<br />booth,{" "}
              <em style={{ color:"#C85B82", fontStyle:"italic" }}>together.</em>
            </h1>

            <p style={{ fontSize:15.5, color:"#9B7B90", lineHeight:1.72, marginBottom:32, margin:"0 0 32px 0" }}>
              A little photo booth on the internet for you and your favorite person—wherever you both are.
            </p>

            {/* CTAs */}
            <div style={{ display:"flex", flexDirection:"column", gap:12, width:"100%" }}>
              <button
                onClick={()=>onStart()}
                style={{ padding:"15px 24px", borderRadius:50, background:"#2449D8", color:"#fff", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:16, border:"none", cursor:"pointer", boxShadow:"0 8px 26px rgba(36,73,216,0.26)", transition:"all 0.2s", letterSpacing:"0.02em" }}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 12px 34px rgba(36,73,216,0.34)"}}
                onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 8px 26px rgba(36,73,216,0.26)"}}
              >
                Start a booth  →
              </button>

              <div style={{ display:"flex", gap:8 }}>
                <input
                  type="text" placeholder="Enter room code"
                  value={joinCode}
                  onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}
                  maxLength={6}
                  style={{ flex:1, padding:"13px 16px", borderRadius:13, border:"1.5px solid rgba(200,91,130,0.25)", background:"rgba(255,255,255,0.82)", fontFamily:"'Nunito',sans-serif", fontSize:15, textAlign:"center", letterSpacing:"0.24em", color:"#2D1B2E", outline:"none", backdropFilter:"blur(8px)" }}
                />
                <button
                  onClick={()=>joinCode.length===6&&onStart(joinCode)}
                  disabled={joinCode.length!==6}
                  style={{ padding:"13px 20px", borderRadius:13, border:"1.5px solid rgba(200,91,130,0.35)", background:"rgba(255,255,255,0.82)", color:"#C85B82", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:14, cursor:"pointer", backdropFilter:"blur(8px)", whiteSpace:"nowrap", transition:"all 0.2s" }}
                >
                  Join
                </button>
              </div>
            </div>

            <p style={{ marginTop:22, fontSize:12, color:"#ccc", display:"flex", alignItems:"center", gap:6 }}>
              <span>🔒</span>
              <span>Your photos belong to you. We never permanently store them.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOM SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function RoomScreen({ code, partnerJoined, copied, onCopy, onContinue }:{
  code:string; partnerJoined:boolean; copied:boolean; onCopy:()=>void; onContinue:()=>void
}) {
  return (
    <div className="screen-enter" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 24px", background:"linear-gradient(160deg,#FDF2F8,#FDF7F2)", fontFamily:"'Nunito',sans-serif", position:"relative", overflow:"hidden" }}>
      <div className="grain-overlay" />
      <div style={{ position:"relative", zIndex:10, width:"100%", maxWidth:460, textAlign:"center" }}>
        <div style={{ fontSize:46, marginBottom:16, animation:"heartbeat 2s ease infinite" }}>🔗</div>
        <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:32, color:"#2D1B2E", marginBottom:8 }}>Your Booth Room</h2>
        <p style={{ color:"#9B7B90", marginBottom:36, fontSize:15 }}>Share this code with your partner to connect</p>

        <div style={{ background:"#fff", borderRadius:22, padding:"32px 28px", boxShadow:"0 4px 36px rgba(200,91,130,0.10)", marginBottom:20 }}>
          <p style={{ fontSize:10, letterSpacing:"0.22em", color:"#ccc", marginBottom:14, fontWeight:700 }}>ROOM CODE</p>
          <div style={{ fontSize:50, fontWeight:800, letterSpacing:"0.3em", color:"#2D1B2E", fontFamily:"'Nunito',sans-serif", marginBottom:22, lineHeight:1 }}>{code}</div>
          <button
            onClick={onCopy}
            style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 22px", borderRadius:12, border:"1.5px solid rgba(200,91,130,0.28)", background:copied?"#F5E6F0":"transparent", color:"#C85B82", fontFamily:"'Nunito',sans-serif", fontSize:14, fontWeight:600, cursor:"pointer", transition:"all 0.2s" }}
          >
            {copied?<><Check size={14}/>Copied!</>:<><Copy size={14}/>Copy invite link</>}
          </button>
        </div>

        {/* Partner status */}
        <div style={{ display:"flex", alignItems:"center", gap:12, background:partnerJoined?"rgba(200,91,130,0.07)":"rgba(0,0,0,0.04)", borderRadius:14, padding:"14px 22px", marginBottom:28, border:`1.5px solid ${partnerJoined?"rgba(200,91,130,0.22)":"rgba(0,0,0,0.07)"}`, transition:"all 0.5s" }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:partnerJoined?"#C85B82":"#ddd", boxShadow:partnerJoined?"0 0 0 3px rgba(200,91,130,0.22)":"none", transition:"all 0.4s", flexShrink:0 }} />
          <span style={{ fontSize:14, color:partnerJoined?"#C85B82":"#9B7B90", fontWeight:600 }}>
            {partnerJoined?"✓ Partner connected — ready to go!":"Waiting for your partner to join…"}
          </span>
          {!partnerJoined&&<div style={{ marginLeft:"auto", display:"flex", gap:4 }}>{[0,1,2].map(i=><div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#C85B82", animation:`blink 1.2s ease ${i*.22}s infinite` }}/>)}</div>}
        </div>

        <button
          onClick={onContinue}
          disabled={!partnerJoined}
          style={{ width:"100%", padding:"15px", borderRadius:16, background:partnerJoined?"linear-gradient(135deg,#C85B82,#BFA3D4)":"#e8e8e8", color:partnerJoined?"#fff":"#bbb", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:16, border:"none", cursor:partnerJoined?"pointer":"not-allowed", boxShadow:partnerJoined?"0 6px 24px rgba(200,91,130,0.35)":"none", transition:"all 0.3s" }}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function LayoutScreen({ selected, onSelect, onContinue }:{
  selected:Layout; onSelect:(l:Layout)=>void; onContinue:()=>void
}) {
  const opts:[Layout,string,string,React.ReactNode][] = [
    ["classic","Classic Strip","4 vertical photos",
      <div style={{ display:"flex", flexDirection:"column", gap:5, width:70 }}>
        {[0,1,2,3].map(i=><div key={i} style={{ height:44, background:`hsl(${330+i*18},58%,${88+i*1.5}%)`, borderRadius:4 }}/>)}
      </div>
    ],
    ["wide","Wide Frame","6 photos — 2 × 3 grid",
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, width:96 }}>
        {[0,1,2,3,4,5].map(i=><div key={i} style={{ height:38, background:`hsl(${268+i*16},48%,${88+i*1.5}%)`, borderRadius:4 }}/>)}
      </div>
    ],
  ]

  return (
    <div className="screen-enter" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px", background:"#FDF8F4", fontFamily:"'Nunito',sans-serif", position:"relative" }}>
      <div className="grain-overlay" />
      <div style={{ position:"relative", zIndex:10, width:"100%", maxWidth:540, textAlign:"center" }}>
        <p style={{ fontSize:11, letterSpacing:"0.2em", color:"#C85B82", marginBottom:10, fontWeight:700 }}>STEP  1 / 3</p>
        <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:34, color:"#2D1B2E", marginBottom:8 }}>Choose your layout</h2>
        <p style={{ color:"#9B7B90", marginBottom:36, fontSize:15 }}>Both layouts give you 10 attempts to capture the perfect shot.</p>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:32 }}>
          {opts.map(([id,name,desc,preview])=>(
            <button key={id} onClick={()=>onSelect(id)} style={{ background:"#fff", borderRadius:22, padding:"30px 20px", border:`2px solid ${selected===id?"#C85B82":"rgba(200,91,130,0.10)"}`, cursor:"pointer", transition:"all 0.24s", boxShadow:selected===id?"0 4px 26px rgba(200,91,130,0.22)":"0 2px 12px rgba(0,0,0,0.05)", transform:selected===id?"scale(1.03)":"scale(1)", display:"flex", flexDirection:"column", alignItems:"center", gap:18 }}>
              {preview}
              <div>
                <div style={{ fontWeight:700, color:"#2D1B2E", fontSize:16, marginBottom:4 }}>{name}</div>
                <div style={{ fontSize:13, color:"#9B7B90" }}>{desc}</div>
              </div>
              {selected===id&&<div style={{ width:24, height:24, borderRadius:"50%", background:"#C85B82", display:"flex", alignItems:"center", justifyContent:"center" }}><Check size={13} color="#fff" strokeWidth={3}/></div>}
            </button>
          ))}
        </div>

        <button onClick={onContinue} style={{ width:"100%", padding:"15px", borderRadius:16, background:"linear-gradient(135deg,#C85B82,#BFA3D4)", color:"#fff", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:16, border:"none", cursor:"pointer", boxShadow:"0 6px 24px rgba(200,91,130,0.35)" }}>
          Next: Choose Scene →
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function ThemeScreen({ selected,selectedProp,onSelect,onPropSelect,onContinue }:{
  selected:ThemeId;selectedProp:PropId;onSelect:(t:ThemeId)=>void;onPropSelect:(p:PropId)=>void;onContinue:()=>void
}) {
  return (
    <div className="screen-enter" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px", background:"#FDF8F4", fontFamily:"'Nunito',sans-serif", position:"relative" }}>
      <div className="grain-overlay" />
      <div style={{ position:"relative", zIndex:10, width:"100%", maxWidth:680, textAlign:"center" }}>
        <p style={{ fontSize:11, letterSpacing:"0.2em", color:"#C85B82", marginBottom:10, fontWeight:700 }}>STEP  2 / 3</p>
        <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:34, color:"#2D1B2E", marginBottom:8 }}>Choose your scene</h2>
        <p style={{ color:"#9B7B90", marginBottom:32, fontSize:15 }}>Choose a shared background, then add an optional face-tracked social-camera filter for both of you.</p>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(156px,1fr))", gap:12, marginBottom:24 }}>
          {THEMES.map(t=>(
            <button key={t.id} onClick={()=>onSelect(t.id)} style={{ background:t.previewBg, borderRadius:18, padding:"24px 14px", border:`2.5px solid ${selected===t.id?t.accent:"transparent"}`, cursor:"pointer", transition:"all 0.24s", boxShadow:selected===t.id?`0 4px 22px ${t.accent}55`:"0 2px 10px rgba(0,0,0,0.08)", transform:selected===t.id?"scale(1.04)":"scale(1)", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:26 }}>{t.emoji}</span>
              <span style={{ fontWeight:700, color:t.dark?"#fff":"#2D1B2E", fontSize:14 }}>{t.name}</span>
              <span style={{ fontSize:11, color:t.dark?"rgba(255,255,255,0.62)":"#9B7B90", lineHeight:1.5 }}>{t.tagline}</span>
              {selected===t.id&&<div style={{ width:22, height:22, borderRadius:"50%", background:t.accent, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 0 0 3px rgba(255,255,255,0.28)` }}><Check size={11} color="#fff" strokeWidth={3}/></div>}
            </button>
          ))}
        </div>

        <div style={{ background:"linear-gradient(145deg,rgba(255,255,255,.94),rgba(255,240,247,.82))",border:"1px solid rgba(200,91,130,.2)",borderRadius:18,padding:"18px",marginBottom:28,boxShadow:"0 12px 32px rgba(115,71,98,.1)" }}>
          <p style={{ fontSize:11,letterSpacing:".14em",color:"#C85B82",fontWeight:900,marginBottom:12 }}>SHARED FACE FILTERS · LIVE</p>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(118px,1fr))",gap:9 }}>
            {PROPS.map(prop=>(
              <button key={prop.id} onClick={()=>onPropSelect(prop.id)} style={{ borderRadius:13,padding:"12px 6px",border:`1.5px solid ${selectedProp===prop.id?"#C85B82":"#E7D9E2"}`,background:selectedProp===prop.id?"linear-gradient(145deg,#fff,#FFF1F7)":"rgba(255,255,255,.7)",boxShadow:selectedProp===prop.id?"0 7px 18px rgba(200,91,130,.18)":"0 3px 10px rgba(59,36,68,.06)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,transition:"all .16s",transform:selectedProp===prop.id?"translateY(-2px)":"none" }}>
                <span style={{ fontSize:23,lineHeight:1,color:selectedProp===prop.id?"#C85B82":"#6C536A",textShadow:selectedProp===prop.id?"0 2px 10px rgba(200,91,130,.28)":"none" }}>{prop.emoji}</span>
                <span style={{ fontSize:10,fontWeight:900,color:"#2D1B2E",textTransform:"uppercase",letterSpacing:".04em" }}>{prop.name}</span>
                <span style={{ fontSize:9,color:"#9B7B90",lineHeight:1.3 }}>{prop.tagline}</span>
              </button>
            ))}
          </div>
          <p style={{ fontSize:10,color:"#8F7287",marginTop:12 }}>Glow effects and cycling pixel-sticker sets follow both faces and stay synchronized across the room.</p>
        </div>

        <button onClick={onContinue} style={{ width:"100%", padding:"15px", borderRadius:16, background:"linear-gradient(135deg,#C85B82,#BFA3D4)", color:"#fff", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:16, border:"none", cursor:"pointer", boxShadow:"0 6px 24px rgba(200,91,130,0.35)" }}>
          Next: Get Ready →
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GET READY SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function GetReadyScreen({ stream, remoteStream, tipIndex,skinSmoothing,onSkinSmoothingChange,onContinue }:{
  stream:MediaStream|null; remoteStream:MediaStream|null; tipIndex:number;
  skinSmoothing:SkinSmoothing;onSkinSmoothingChange:(strength:SkinSmoothing)=>void;onContinue:()=>void
}) {
  const vidRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(()=>{
    if(stream&&vidRef.current){
      vidRef.current.srcObject=stream
      vidRef.current.play().then(()=>setReady(true)).catch(()=>{})
    }
  },[stream])

  useEffect(()=>{
    if(remoteStream&&remoteRef.current){
      remoteRef.current.srcObject=remoteStream
      remoteRef.current.play().catch(()=>{})
    }
  },[remoteStream])

  return (
    <div className="screen-enter" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px", background:"#FDF8F4", fontFamily:"'Nunito',sans-serif", position:"relative" }}>
      <div className="grain-overlay" />
      <div style={{ position:"relative", zIndex:10, width:"100%", maxWidth:580, textAlign:"center" }}>
        <p style={{ fontSize:11, letterSpacing:"0.2em", color:"#C85B82", marginBottom:10, fontWeight:700 }}>STEP  3 / 3</p>
        <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:34, color:"#2D1B2E", marginBottom:8 }}>Get comfortable</h2>
        <p style={{ color:"#9B7B90", marginBottom:28, fontSize:15 }}>Check your lighting, framing, and smile — then you"re ready.</p>

        {/* Camera preview */}
        <div style={{ position:"relative", borderRadius:22, overflow:"hidden", background:"#111", aspectRatio:"4/3", maxWidth:380, margin:"0 auto 24px", boxShadow:"0 10px 44px rgba(0,0,0,0.18)" }}>
          <video ref={vidRef} autoPlay playsInline muted style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)", display:"block",filter:skinSmoothing===0?"none":skinSmoothing===1?"brightness(1.012) saturate(.995)":"brightness(1.022) saturate(.985)" }}/>
          {remoteStream&&<video ref={remoteRef} autoPlay playsInline style={{ position:"absolute", right:12, bottom:12, width:"34%", aspectRatio:"4/3", objectFit:"cover", transform:"scaleX(-1)", borderRadius:14, border:"3px solid #fff", boxShadow:"0 8px 24px rgba(0,0,0,.25)" }}/>} 
          {!ready&&(
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, color:"rgba(255,255,255,0.7)" }}>
              <Camera size={30} strokeWidth={1.5}/>
              <p style={{ fontSize:14 }}>Requesting camera…</p>
            </div>
          )}
          {ready&&(
            <div style={{ position:"absolute", top:12, left:12, display:"flex", alignItems:"center", gap:6, background:"rgba(0,0,0,0.48)", backdropFilter:"blur(8px)", borderRadius:20, padding:"5px 11px" }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 0 2px rgba(74,222,128,0.28)" }}/>
              <span style={{ fontSize:11, color:"#fff", fontWeight:600 }}>You</span>
            </div>
          )}
          {remoteStream&&<div style={{ position:"absolute", right:18, bottom:18, color:"#fff", background:"rgba(0,0,0,.48)", padding:"4px 9px", borderRadius:20, fontSize:10 }}>Partner · live</div>}
          {/* Subtle grid overlay */}
          {ready&&<div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)", backgroundSize:"25% 33.3%", pointerEvents:"none" }}/>}
        </div>

        <div style={{ margin:"0 auto 18px",maxWidth:400,background:"rgba(255,255,255,.86)",borderRadius:16,padding:"15px 16px",border:"1px solid rgba(200,91,130,.14)",boxShadow:"0 3px 16px rgba(59,36,68,.05)",textAlign:"left" }}>
          <div style={{ display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline",marginBottom:10 }}>
            <p style={{ margin:0,fontSize:11,fontWeight:900,letterSpacing:".12em",color:"#C85B82" }}>YOUR SKIN SOFTENING</p>
            <span style={{ fontSize:9,color:"#A78B9E" }}>Your choice only</span>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
            {([[0,"Natural"],[1,"Soft retouch"],[2,"Glow retouch"]] as [SkinSmoothing,string][]).map(([value,label])=>(
              <button key={value} onClick={()=>onSkinSmoothingChange(value)} style={{ border:`1.5px solid ${skinSmoothing===value?"#C85B82":"#E6D9E1"}`,borderRadius:10,padding:"9px 6px",background:skinSmoothing===value?"#FFF4F8":"#fff",color:skinSmoothing===value?"#A7466A":"#755F70",fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:11,cursor:"pointer",boxShadow:skinSmoothing===value?"0 3px 10px rgba(200,91,130,.12)":"none" }}>
                {label}
              </button>
            ))}
          </div>
          <p style={{ margin:"9px 2px 0",fontSize:10,lineHeight:1.45,color:"#A08698" }}>Optional and face-only in the booth. Your partner controls their own setting.</p>
        </div>

        {/* Tip card */}
        <div style={{ margin:"0 auto 24px", maxWidth:400, background:"#fff", borderRadius:16, padding:"16px 22px", border:"1px solid rgba(200,91,130,0.12)", boxShadow:"0 2px 14px rgba(0,0,0,0.04)", textAlign:"left" }}>
          <p style={{ fontSize:11, color:"#C85B82", fontWeight:700, marginBottom:6, letterSpacing:"0.1em" }}>💡  TIP {tipIndex+1} / {TIPS.length}</p>
          <p style={{ fontSize:14, color:"#2D1B2E", lineHeight:1.65 }}>{TIPS[tipIndex]}</p>
        </div>

        <button
          onClick={onContinue} disabled={!ready}
          style={{ padding:"15px 56px", borderRadius:16, background:ready?"linear-gradient(135deg,#C85B82,#BFA3D4)":"#e8e8e8", color:ready?"#fff":"#bbb", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:16, border:"none", cursor:ready?"pointer":"not-allowed", boxShadow:ready?"0 6px 24px rgba(200,91,130,0.35)":"none", transition:"all 0.3s" }}
        >
          {ready?"We're Ready! ✦":"Waiting for camera…"}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOTH SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function BoothScreen({ stream, remoteStream, themeId,propId,skinSmoothing,partnerSkinSmoothing,frontParticipant,localParticipant,layout,captureAt,onFrontParticipantChange,onCaptureRequest,onPhotoCapture,onDone }:{
  stream:MediaStream|null;remoteStream:MediaStream|null;themeId:ThemeId;propId:PropId;
  skinSmoothing:SkinSmoothing;partnerSkinSmoothing:SkinSmoothing;frontParticipant:ParticipantId;localParticipant:ParticipantId;layout:Layout;captureAt:number|null;
  onFrontParticipantChange:(participant:ParticipantId)=>void;
  onCaptureRequest:()=>void; onPhotoCapture:(dataUrl:string)=>void; onDone:()=>void
}) {
  const vidRef      = useRef<HTMLVideoElement>(null)
  const partnerRef  = useRef<HTMLVideoElement>(null)
  const previewRef  = useRef<HTMLCanvasElement>(null)
  const captureRef  = useRef<HTMLCanvasElement>(null)
  const localPoseTrackerRef=useRef<PoseLandmarker|null>(null)
  const partnerPoseTrackerRef=useRef<PoseLandmarker|null>(null)
  const localHandTrackerRef=useRef<HandLandmarker|null>(null)
  const partnerHandTrackerRef=useRef<HandLandmarker|null>(null)
  const localMaskRef= useRef(document.createElement("canvas"))
  const partnerMaskRef=useRef(document.createElement("canvas"))
  const localSupportRef=useRef(document.createElement("canvas"))
  const partnerSupportRef=useRef(document.createElement("canvas"))
  const localScratchRef=useRef(document.createElement("canvas"))
  const partnerScratchRef=useRef(document.createElement("canvas"))
  const localFrameRef=useRef(document.createElement("canvas"))
  const partnerFrameRef=useRef(document.createElement("canvas"))
  const localBoundsRef=useRef<PersonBounds|null>(null)
  const partnerBoundsRef=useRef<PersonBounds|null>(null)
  const localPoseRef=useRef<NormalizedLandmark[]>([])
  const partnerPoseRef=useRef<NormalizedLandmark[]>([])
  const localPoseSeenRef=useRef(0)
  const partnerPoseSeenRef=useRef(0)
  const lastSegmentRef=useRef(0)
  const trackerTimestampRef=useRef(0)
  const segmentBusyRef=useRef(false)
  const segmentPartnerNextRef=useRef(false)
  const rafRef      = useRef<number>()
  const timerRef    = useRef<ReturnType<typeof setInterval>>()
  const [photos, setPhotos]     = useState<string[]>([])
  const [countdown, setCountdown] = useState<number|null>(null)
  const [flashing, setFlashing]   = useState(false)
  const [proximity, setProximity] = useState(()=>import.meta.env.DEV&&new URLSearchParams(window.location.search).get("demoOverlap")==="1"?100:50)
  const [poked, setPoked]         = useState(false)
  const [segmentStatus,setSegmentStatus]=useState<"loading"|"ready"|"error">("loading")
  const [localMaskReady,setLocalMaskReady]=useState(false)
  const [partnerMaskReady,setPartnerMaskReady]=useState(false)
  const localMaskReadyRef=useRef(false)
  const partnerMaskReadyRef=useRef(false)

  const theme  = THEMES.find(t=>t.id===themeId)!
  const isDark = theme.dark
  const MAX    = 10
  const needed = layout==="classic"?4:6
  const masksReady=segmentStatus==="ready"&&localMaskReady&&partnerMaskReady
  const canShoot=Boolean(remoteStream)&&masksReady&&countdown===null&&photos.length<MAX

  useEffect(()=>{
    if(stream&&vidRef.current){ vidRef.current.srcObject=stream; vidRef.current.play().catch(()=>{}) }
  },[stream])

  useEffect(()=>{
    if(remoteStream&&partnerRef.current){ partnerRef.current.srcObject=remoteStream; partnerRef.current.play().catch(()=>{}) }
    if(!remoteStream){ partnerMaskReadyRef.current=false; setPartnerMaskReady(false) }
  },[remoteStream])

  useEffect(()=>{
    let cancelled=false
    ;(async()=>{
      try{
        const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm")
        const poseOptions={
            baseOptions:{ modelAssetPath:"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" },
            runningMode:"VIDEO",
            numPoses:1,
            minPoseDetectionConfidence:.36,
            minPosePresenceConfidence:.34,
            minTrackingConfidence:.34,
            outputSegmentationMasks:true,
          } as const
        const handOptions={
            baseOptions:{ modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
            runningMode:"VIDEO",
            numHands:2,
            minHandDetectionConfidence:.55,
            minHandPresenceConfidence:.5,
            minTrackingConfidence:.5,
          } as const
        const [localPose,partnerPose,localHands,partnerHands]=await Promise.all([
          PoseLandmarker.createFromOptions(vision,poseOptions),
          PoseLandmarker.createFromOptions(vision,poseOptions),
          HandLandmarker.createFromOptions(vision,handOptions),
          HandLandmarker.createFromOptions(vision,handOptions),
        ])
        if(cancelled){ localPose.close();partnerPose.close();localHands.close();partnerHands.close();return }
        localPoseTrackerRef.current=localPose;partnerPoseTrackerRef.current=partnerPose
        localHandTrackerRef.current=localHands;partnerHandTrackerRef.current=partnerHands
        setSegmentStatus("ready")
      }catch(error){
        console.error("Person segmentation could not start",error)
        if(!cancelled) setSegmentStatus("error")
      }
    })()
    return ()=>{
      cancelled=true
      localPoseTrackerRef.current?.close();partnerPoseTrackerRef.current?.close()
      localHandTrackerRef.current?.close();partnerHandTrackerRef.current?.close()
      localPoseTrackerRef.current=null;partnerPoseTrackerRef.current=null
      localHandTrackerRef.current=null;partnerHandTrackerRef.current=null
    }
  },[])

  const updatePersonMask=useCallback((video:HTMLVideoElement,poseTracker:PoseLandmarker|null,handTracker:HandLandmarker|null,frameCanvas:HTMLCanvasElement,maskCanvas:HTMLCanvasElement,supportCanvas:HTMLCanvasElement,boundsRef:MutableRefObject<PersonBounds|null>,poseRef:MutableRefObject<NormalizedLandmark[]>,lastSeenRef:MutableRefObject<number>,onFirstMask:()=>void,timestamp:number)=>{
    if(!poseTracker||!handTracker||video.readyState<2||!video.videoWidth) return
    const hands=handTracker.detectForVideo(video,timestamp).landmarks
    poseTracker.detectForVideo(video,timestamp,result=>{
      if(frameCanvas.width!==video.videoWidth) frameCanvas.width=video.videoWidth
      if(frameCanvas.height!==video.videoHeight) frameCanvas.height=video.videoHeight
      frameCanvas.getContext("2d")!.drawImage(video,0,0,frameCanvas.width,frameCanvas.height)
      const pose=result.landmarks[0]||[]
      if(pose.length){ poseRef.current=smoothPoseLandmarks(poseRef.current,pose);lastSeenRef.current=timestamp }
      else if(timestamp-lastSeenRef.current>360) poseRef.current=[]
      const mask=result.segmentationMasks?.[0]
      if(!mask) return
      const width=mask.width, height=mask.height
      if(maskCanvas.width!==width) maskCanvas.width=width
      if(maskCanvas.height!==height) maskCanvas.height=height
      if(supportCanvas.width!==width) supportCanvas.width=width
      if(supportCanvas.height!==height) supportCanvas.height=height
      renderLandmarkSupport(supportCanvas,poseRef.current,hands)
      const values=mask.getAsFloat32Array()
      const supportPixels=supportCanvas.getContext("2d")!.getImageData(0,0,width,height).data
      const pixels=new Uint8ClampedArray(width*height*4)
      const matteAlpha=new Uint8ClampedArray(width*height)
      for(let i=0;i<values.length;i++){
        const p=i*4
        // Landmarks only lower the segmentation threshold around a likely limb;
        // they never punch an opaque skeleton-shaped hole into the background.
        const landmarkSupport=supportPixels[p+3]/255
        const threshold=.23-landmarkSupport*.09
        const normalized=Math.max(0,Math.min(1,(values[i]-threshold)/.44))
        const feathered=normalized*normalized*(3-2*normalized)
        matteAlpha[i]=Math.round(feathered*255)
      }
      for(let y=0;y<height;y++) for(let x=0;x<width;x++){
        const i=y*width+x,p=i*4
        const center=matteAlpha[i]
        // Suppress the low-confidence one-pixel fringe without hard-cutting
        // fine hair or fingers. This acts as a gentle sub-pixel erosion before
        // the browser scales the matte into the final booth frame.
        let neighborMin=center
        if(x>0) neighborMin=Math.min(neighborMin,matteAlpha[i-1])
        if(x<width-1) neighborMin=Math.min(neighborMin,matteAlpha[i+1])
        if(y>0) neighborMin=Math.min(neighborMin,matteAlpha[i-width])
        if(y<height-1) neighborMin=Math.min(neighborMin,matteAlpha[i+width])
        const refined=Math.round(center*.76+neighborMin*.24)
        pixels[p]=pixels[p+1]=pixels[p+2]=255
        pixels[p+3]=refined
      }
      maskCanvas.getContext("2d")!.putImageData(new ImageData(pixels,width,height),0,0)
      boundsRef.current=boundsFromTracking(poseRef.current,hands,boundsRef.current,pixels,width,height)
      onFirstMask()
    })
  },[])

  // Animation loop
  useEffect(()=>{
    const canvas=previewRef.current, video=vidRef.current
    if(!canvas||!video) return
    const ctx=canvas.getContext("2d")!
    const loop=()=>{
      const now=performance.now()
      if(localPoseTrackerRef.current&&partnerPoseTrackerRef.current&&localHandTrackerRef.current&&partnerHandTrackerRef.current&&!segmentBusyRef.current&&now-lastSegmentRef.current>66){
        segmentBusyRef.current=true
        try{
          const localTimestamp=Math.max(Math.floor(now),trackerTimestampRef.current+2)
          const partner=partnerRef.current
          // Each participant owns a stateful VIDEO-mode tracker. Alternate the
          // expensive inference work, but never feed two cameras into one
          // tracker or its temporal history will pull filters toward old faces.
          const processPartner=Boolean(partner&&remoteStream&&segmentPartnerNextRef.current)
          if(processPartner&&partner){
            updatePersonMask(partner,partnerPoseTrackerRef.current,partnerHandTrackerRef.current,partnerFrameRef.current,partnerMaskRef.current,partnerSupportRef.current,partnerBoundsRef,partnerPoseRef,partnerPoseSeenRef,()=>{
              if(!partnerMaskReadyRef.current){ partnerMaskReadyRef.current=true; setPartnerMaskReady(true) }
            },localTimestamp)
          }else{
            updatePersonMask(video,localPoseTrackerRef.current,localHandTrackerRef.current,localFrameRef.current,localMaskRef.current,localSupportRef.current,localBoundsRef,localPoseRef,localPoseSeenRef,()=>{
              if(!localMaskReadyRef.current){ localMaskReadyRef.current=true; setLocalMaskReady(true) }
            },localTimestamp)
          }
          segmentPartnerNextRef.current=Boolean(partner&&remoteStream)&&!segmentPartnerNextRef.current
          trackerTimestampRef.current=localTimestamp
          lastSegmentRef.current=now
        }catch(error){ console.warn("Person mask frame skipped",error) }
        finally{ segmentBusyRef.current=false }
      }
      drawBoothFrame(
        ctx,video,partnerRef.current,canvas.width,canvas.height,themeId,propId,skinSmoothing,partnerSkinSmoothing,frontParticipant,localParticipant,proximity,
        localMaskReadyRef.current?localMaskRef.current:null,
        partnerMaskReadyRef.current?partnerMaskRef.current:null,
        localBoundsRef.current,partnerBoundsRef.current,
        localPoseRef.current,partnerPoseRef.current,
        localScratchRef.current,partnerScratchRef.current,localFrameRef.current,partnerFrameRef.current,false
      )
      rafRef.current=requestAnimationFrame(loop)
    }
    loop()
    return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current) }
  },[themeId,propId,skinSmoothing,partnerSkinSmoothing,frontParticipant,localParticipant,proximity,remoteStream,updatePersonMask])

  const doCapture = useCallback(()=>{
    const video=vidRef.current, canvas=captureRef.current
    if(!video||!canvas) return
    const ctx=canvas.getContext("2d")!
    drawBoothFrame(
      ctx,video,partnerRef.current,canvas.width,canvas.height,themeId,propId,skinSmoothing,partnerSkinSmoothing,frontParticipant,localParticipant,proximity,
      localMaskReadyRef.current?localMaskRef.current:null,
      partnerMaskReadyRef.current?partnerMaskRef.current:null,
      localBoundsRef.current,partnerBoundsRef.current,
      localPoseRef.current,partnerPoseRef.current,
      localScratchRef.current,partnerScratchRef.current,localFrameRef.current,partnerFrameRef.current,true
    )
    const url=canvas.toDataURL("image/jpeg",0.93)
    setPhotos(prev=>[...prev,url])
    onPhotoCapture(url)
    setPoked(true); setTimeout(()=>setPoked(false),900)
  },[themeId,propId,skinSmoothing,partnerSkinSmoothing,frontParticipant,localParticipant,proximity,onPhotoCapture])

  useEffect(()=>{
    if(!captureAt||photos.length>=MAX) return
    clearInterval(timerRef.current)
    const tick=()=>{
      const remaining=captureAt-Date.now()
      if(remaining>0) setCountdown(Math.max(1,Math.ceil(remaining/1000)))
      else {
        clearInterval(timerRef.current); setCountdown(null); setFlashing(true)
        setTimeout(()=>{ setFlashing(false); doCapture() },110)
      }
    }
    tick(); timerRef.current=setInterval(tick,100)
    return ()=>clearInterval(timerRef.current)
  },[captureAt])

  useEffect(()=>()=>{ clearInterval(timerRef.current); if(rafRef.current) cancelAnimationFrame(rafRef.current) },[])

  const bg   = isDark?"#0d0118":"#FDF8F4"
  const fg   = isDark?"#fff":"#2D1B2E"
  const sub  = isDark?"rgba(255,255,255,0.45)":"#9B7B90"
  const acc  = isDark?theme.accent:"#C85B82"

  return (
    <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", fontFamily:"'Nunito',sans-serif", position:"relative", overflowX:"hidden", overflowY:"auto" }}>
      <div className="grain-overlay" />
      {flashing&&<div style={{ position:"fixed", inset:0, background:"#fff", zIndex:9999, animation:"flashOut 0.3s ease forwards", pointerEvents:"none" }}/>}

      <video ref={vidRef} autoPlay playsInline muted style={{ display:"none" }}/>
      <video ref={partnerRef} autoPlay playsInline style={{ display:"none" }}/>
      <canvas ref={captureRef} width={800} height={528} style={{ display:"none" }}/>

      {/* Header */}
      <div style={{ position:"relative", zIndex:10, padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:12, color:acc, fontWeight:700, letterSpacing:"0.12em" }}>duet ♡</span>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          {Array.from({length:MAX},(_,i)=>(
            <div key={i} style={{ height:7, width:i<photos.length?18:7, borderRadius:4, background:i<photos.length?acc:isDark?"rgba(255,255,255,0.1)":"rgba(200,91,130,0.14)", transition:"all 0.35s" }}/>
          ))}
        </div>
        <span style={{ fontSize:12, color:sub, fontWeight:600 }}>{photos.length}/{MAX}</span>
      </div>

      {/* Canvas */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"safe center", padding:"0 14px 24px", gap:14, position:"relative", zIndex:10 }}>
        <div style={{ position:"relative", borderRadius:22, overflow:"hidden", boxShadow:isDark?`0 0 0 2px ${theme.accent}44,0 18px 60px rgba(0,0,0,0.65)`:"0 10px 50px rgba(0,0,0,0.13)", maxWidth:760, width:"100%" }}>
          <canvas ref={previewRef} width={760} height={500} style={{ display:"block", width:"100%", aspectRatio:"760/500", borderRadius:22 }}/>

          {/* You / Partner labels */}
          <div style={{ position:"absolute", bottom:14, left:"17%", transform:"translateX(-50%)", background:"rgba(0,0,0,0.44)", backdropFilter:"blur(6px)", borderRadius:20, padding:"4px 12px" }}>
            <span style={{ fontSize:11, color:"#fff", fontWeight:600 }}>You</span>
          </div>
          <div style={{ position:"absolute", bottom:14, right:"14%", transform:"translateX(50%)", background:"rgba(0,0,0,0.44)", backdropFilter:"blur(6px)", borderRadius:20, padding:"4px 12px" }}>
            <span style={{ fontSize:11, color:"#fff", fontWeight:600 }}>{remoteStream?"Partner · live":"Partner · connecting"}</span>
          </div>

          {/* Countdown */}
          {countdown!==null&&(
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.22)", backdropFilter:"blur(3px)" }}>
              <span key={countdown} style={{ fontSize:"clamp(80px,20vw,128px)", fontWeight:900, color:"#fff", fontFamily:"'DM Serif Display',serif", animation:"countdownPop 1s cubic-bezier(0.22,1,0.36,1) forwards", textShadow:"0 4px 32px rgba(0,0,0,0.45)" }}>{countdown}</span>
            </div>
          )}

          {/* Just captured badge */}
          {poked&&(
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
              <div style={{ background:"rgba(200,91,130,0.92)", borderRadius:50, padding:"12px 22px", display:"flex", alignItems:"center", gap:8, animation:"scaleIn 0.3s ease" }}>
                <Check size={15} color="#fff" strokeWidth={3}/>
                <span style={{ color:"#fff", fontWeight:700, fontSize:14 }}>Shot {photos.length}!</span>
              </div>
            </div>
          )}
        </div>

        {/* Proximity */}
        <div style={{ display:"flex", alignItems:"center", gap:12, background:isDark?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.85)", backdropFilter:"blur(12px)", borderRadius:50, padding:"10px 22px", border:`1px solid ${isDark?"rgba(255,255,255,0.09)":"rgba(200,91,130,0.14)"}` }}>
          <span style={{ fontSize:12, color:sub, whiteSpace:"nowrap", fontWeight:600 }}>← Further</span>
          <input type="range" min={0} max={100} value={proximity} onChange={e=>setProximity(Number(e.target.value))} style={{ width:130, "--thumb-color":acc, accentColor:acc } as React.CSSProperties & Record<string,string>}/>
          <span style={{ fontSize:12, color:sub, whiteSpace:"nowrap", fontWeight:600 }}>Closer →</span>
        </div>

        <div style={{ display:"flex",alignItems:"center",gap:8,background:isDark?"rgba(255,255,255,.06)":"rgba(255,255,255,.86)",border:`1px solid ${isDark?"rgba(255,255,255,.09)":"rgba(132,185,207,.24)"}`,borderRadius:50,padding:"7px 9px 7px 14px",backdropFilter:"blur(12px)" }}>
          <span style={{ fontSize:11,color:sub,fontWeight:800,letterSpacing:".06em",marginRight:2 }}>FRONT PERSON</span>
          {(["p1","p2"] as ParticipantId[]).map(participant=>{
            const isYou=participant===localParticipant
            return <button key={participant} onClick={()=>onFrontParticipantChange(participant)} aria-pressed={frontParticipant===participant} style={{ borderRadius:30,border:`1px solid ${frontParticipant===participant?acc:isDark?"rgba(255,255,255,.12)":"#D9E5EA"}`,padding:"7px 11px",background:frontParticipant===participant?acc:"transparent",color:frontParticipant===participant?"#fff":fg,fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:900,cursor:"pointer",boxShadow:frontParticipant===participant?`0 4px 13px ${acc}45`:"none" }}>
              {participant.toUpperCase()} · {isYou?"You":"Partner"}
            </button>
          })}
        </div>

        <div style={{ fontSize:11, color:segmentStatus==="error"?"#ef4444":sub, fontWeight:600 }}>
          {segmentStatus==="error"?"Body tracking could not load — refresh to retry":masksReady?"Bodies and hands tracked ✓":"Preparing body and hand tracking…"}
        </div>

        {/* Thumbnails */}
        {photos.length>0&&(
          <div style={{ display:"flex", gap:7, overflowX:"auto", maxWidth:"100%", paddingBottom:4 }}>
            {photos.map((p,i)=>(
              <div key={i} style={{ flexShrink:0, width:54, height:38, borderRadius:8, overflow:"hidden", border:`2px solid ${isDark?theme.accent+"44":"rgba(200,91,130,0.22)"}` }}>
                <img src={p} alt={`Shot ${i+1}`} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ position:"relative", zIndex:10, padding:"16px 24px 36px", display:"flex", alignItems:"center", justifyContent:"center", gap:20 }}>
        <div style={{ width:120, fontSize:11, color:sub, lineHeight:1.4, textAlign:"right" }}>{!remoteStream?"Waiting for partner’s live camera":!masksReady?"Tracking bodies, arms, and hands":photos.length<MAX?`${MAX-photos.length} moment${MAX-photos.length===1?"":"s"} left`:"All ten captured"}</div>

        {/* Shutter */}
        <button
          onClick={canShoot?onCaptureRequest:undefined}
          disabled={!canShoot}
          aria-label="Capture photo"
          style={{ width:72, height:72, borderRadius:"50%", background:!canShoot?(isDark?"rgba(255,255,255,0.14)":"#e8e8e8"):acc, border:`4px solid ${isDark?"rgba(255,255,255,0.14)":"rgba(200,91,130,0.18)"}`, boxShadow:!canShoot?"none":`0 6px 26px ${acc}80`, cursor:!canShoot?"not-allowed":"pointer", transition:"all 0.2s", display:"flex", alignItems:"center", justifyContent:"center" }}
          onMouseEnter={e=>{ if(canShoot) e.currentTarget.style.transform="scale(1.08)" }}
          onMouseLeave={e=>{ e.currentTarget.style.transform="" }}
        >
          <div style={{ width:28, height:28, borderRadius:"50%", background:"rgba(255,255,255,0.92)" }}/>
        </button>

        {photos.length>=MAX&&(
          <button onClick={onDone} style={{ padding:"12px 24px", borderRadius:50, background:"linear-gradient(135deg,#C85B82,#BFA3D4)", color:"#fff", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:14, border:"none", cursor:"pointer", boxShadow:"0 4px 18px rgba(200,91,130,0.4)" }}>
            Done →
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function SelectScreen({ photos, selected, layout, onToggle, onContinue }:{
  photos:string[]; selected:number[]; layout:Layout; onToggle:(i:number)=>void; onContinue:()=>void
}) {
  const needed=layout==="classic"?4:6
  const done=selected.length===needed

  return (
    <div className="screen-enter" style={{ minHeight:"100vh", background:"#FDF8F4", fontFamily:"'Nunito',sans-serif", position:"relative" }}>
      <div className="grain-overlay" />
      <div style={{ position:"relative", zIndex:10, maxWidth:680, margin:"0 auto", padding:"40px 18px" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:32, color:"#2D1B2E", marginBottom:8 }}>Pick your favourites</h2>
          <p style={{ color:"#9B7B90", fontSize:15 }}>
            Choose <strong style={{ color:"#C85B82" }}>{needed} photos</strong> for your {layout==="classic"?"classic strip":"wide frame"}.{" "}
            <span style={{ color:done?"#C85B82":"#ccc", fontWeight:600 }}>{selected.length}/{needed} selected</span>
          </p>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(176px,1fr))", gap:12, marginBottom:32 }}>
          {photos.map((p,i)=>{
            const isSel=selected.includes(i)
            const rank=selected.indexOf(i)
            return (
              <button key={i} onClick={()=>onToggle(i)} style={{ position:"relative", borderRadius:14, overflow:"hidden", aspectRatio:"4/3", border:`3px solid ${isSel?"#C85B82":"transparent"}`, cursor:"pointer", background:"#000", padding:0, transform:isSel?"scale(1.03)":"scale(1)", boxShadow:isSel?"0 6px 26px rgba(200,91,130,0.38)":"0 2px 10px rgba(0,0,0,0.07)", transition:"all 0.2s" }}>
                <img src={p} alt={`Photo ${i+1}`} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block", opacity:isSel?1:selected.length>=needed?0.42:0.78, transition:"opacity 0.2s" }}/>
                {isSel&&<div style={{ position:"absolute", top:8, right:8, width:26, height:26, borderRadius:"50%", background:"#C85B82", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 8px rgba(0,0,0,0.2)" }}><span style={{ fontSize:12, color:"#fff", fontWeight:800 }}>{rank+1}</span></div>}
                <div style={{ position:"absolute", bottom:6, left:8, fontSize:11, color:"rgba(255,255,255,0.68)", fontWeight:600 }}>#{i+1}</div>
              </button>
            )
          })}
        </div>

        <button onClick={onContinue} disabled={!done} style={{ width:"100%", padding:"15px", borderRadius:16, background:done?"linear-gradient(135deg,#C85B82,#BFA3D4)":"#e8e8e8", color:done?"#fff":"#bbb", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:16, border:"none", cursor:done?"pointer":"not-allowed", boxShadow:done?"0 6px 24px rgba(200,91,130,0.35)":"none", transition:"all 0.3s" }}>
          {done?"Customize Your Strip →":`Select ${needed-selected.length} more photo${needed-selected.length!==1?"s":""}`}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMIZE SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function CustomizeScreen({ photos, selectedIndices, layout, onDone }:{
  photos:string[]; selectedIndices:number[]; layout:Layout; onDone:(opts:CustomizeOpts)=>void
}) {
  const [frameColor, setFrameColor] = useState("#ffffff")
  const [filter, setFilter]         = useState<FilterId>("none")
  const [stickers, setStickers]     = useState<StickerItem[]>([])
  const [name1, setName1]           = useState("")
  const [name2, setName2]           = useState("")
  const [date, setDate]             = useState(fmtDate(new Date()))
  const [tab, setTab]               = useState<"frame"|"filter"|"stickers"|"text">("frame")
  const [offsets, setOffsets]       = useState<Record<number,{x:number;y:number}>>({})
  const [drag, setDrag]             = useState<{idx:number;sx:number;sy:number;ox:number;oy:number}|null>(null)

  const needed        = layout==="classic"?4:6
  const selectedPhotos= selectedIndices.slice(0,needed).map(i=>photos[i])
  const isDark        = frameColor==="#1a1a1a"
  const filterCSS     = FILTERS.find(f=>f.id===filter)?.css||"none"
  const cols          = layout==="classic"?1:2
  const rows          = layout==="classic"?4:3
  const photoH        = layout==="classic"?82:68
  const stripW        = layout==="classic"?188:268

  const addSticker=(emoji:string)=>setStickers(prev=>[...prev,{ id:uid(), emoji, x:25+Math.random()*50, y:15+Math.random()*65, rot:(Math.random()-.5)*28 }])

  const tabs=[
    {id:"frame" as const,  label:"Frame",   icon:"🖼️"},
    {id:"filter" as const, label:"Filter",  icon:"✨"},
    {id:"stickers" as const,label:"Stickers",icon:"🌸"},
    {id:"text" as const,   label:"Names",   icon:"✍️"},
  ]

  return (
    <div className="screen-enter" style={{ minHeight:"100vh", background:"#FDF8F4", fontFamily:"'Nunito',sans-serif", position:"relative" }}>
      <div className="grain-overlay" />
      <div style={{ position:"relative", zIndex:10, maxWidth:900, margin:"0 auto", padding:"32px 18px", display:"flex", flexWrap:"wrap", gap:28, alignItems:"flex-start", justifyContent:"center" }}>

        {/* Strip preview */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
          <p style={{ fontSize:11, letterSpacing:"0.16em", color:"#9B7B90", fontWeight:700 }}>PREVIEW</p>

          <div
            style={{ width:stripW, background:frameColor, borderRadius:10, boxShadow:"0 14px 52px rgba(0,0,0,0.17)", overflow:"hidden", position:"relative", userSelect:"none" }}
            onMouseMove={e=>{ if(!drag) return; const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy; setOffsets(o=>({...o,[drag.idx]:{x:drag.ox+dx,y:drag.oy+dy}})) }}
            onMouseUp={()=>setDrag(null)}
            onMouseLeave={()=>setDrag(null)}
          >
            {/* Header */}
            <div style={{ height:28, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:8, letterSpacing:"0.24em", color:isDark?"rgba(255,255,255,0.45)":"#C85B82", fontWeight:700 }}>duet ♡</span>
            </div>

            {/* Photos */}
            <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gap:4, padding:"0 7px" }}>
              {selectedPhotos.map((p,i)=>(
                <div key={i}
                  style={{ position:"relative", height:photoH, borderRadius:4, overflow:"hidden", cursor:"grab", background:"#eee" }}
                  onMouseDown={e=>{ e.preventDefault(); setDrag({idx:i,sx:e.clientX,sy:e.clientY,ox:offsets[i]?.x||0,oy:offsets[i]?.y||0}) }}
                >
                  <img src={p} alt="" draggable={false} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block", filter:filterCSS!=="none"?filterCSS:undefined, transform:`translate(${offsets[i]?.x||0}px,${offsets[i]?.y||0}px) scale(1.12)`, transformOrigin:"center", pointerEvents:"none", transition:drag?.idx===i?"none":"transform 0s" }}/>
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.2)", opacity:drag?.idx===i?1:0, transition:"opacity 0.15s", pointerEvents:"none" }}>
                    <Move size={13} color="rgba(255,255,255,0.85)"/>
                  </div>
                </div>
              ))}
            </div>

            {/* Stickers */}
            {stickers.map(s=>(
              <div key={s.id} onClick={()=>setStickers(p=>p.filter(x=>x.id!==s.id))} style={{ position:"absolute", left:`${s.x}%`, top:`${s.y}%`, fontSize:17, transform:`rotate(${s.rot}deg)`, cursor:"pointer", userSelect:"none", zIndex:5, lineHeight:1 }} title="Click to remove">
                {s.emoji}
              </div>
            ))}

            {/* Footer */}
            <div style={{ height:34, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, marginTop:5 }}>
              <span style={{ fontSize:11, color:isDark?"rgba(255,255,255,0.65)":"#9B7B90", fontFamily:"'Dancing Script',cursive" }}>
                {name1&&name2?`${name1}  ♡  ${name2}`:name1||name2||"Together ♡"}
              </span>
              <span style={{ fontSize:8, color:isDark?"rgba(255,255,255,0.35)":"#ccc" }}>{date}</span>
            </div>
          </div>

          <p style={{ fontSize:11, color:"#ccc", textAlign:"center" }}>Drag photos to reposition · Click stickers to remove</p>
        </div>

        {/* Controls */}
        <div style={{ flex:1, minWidth:260, maxWidth:380 }}>
          {/* Tabs */}
          <div style={{ display:"flex", gap:5, background:"rgba(200,91,130,0.07)", borderRadius:16, padding:5, marginBottom:22 }}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, padding:"8px 4px", borderRadius:12, border:"none", background:tab===t.id?"#fff":"transparent", boxShadow:tab===t.id?"0 2px 8px rgba(0,0,0,0.07)":"none", cursor:"pointer", fontSize:10, fontWeight:700, color:tab===t.id?"#C85B82":"#9B7B90", transition:"all 0.2s", display:"flex", flexDirection:"column", alignItems:"center", gap:2, fontFamily:"'Nunito',sans-serif" }}>
                <span style={{ fontSize:16 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {tab==="frame"&&(
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:"#9B7B90", marginBottom:14 }}>Frame Color</p>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                {FRAME_COLORS.map(c=>(
                  <button key={c.v} onClick={()=>setFrameColor(c.v)} title={c.label} style={{ width:36, height:36, borderRadius:"50%", border:`3px solid ${frameColor===c.v?"#C85B82":"transparent"}`, background:c.v, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.14)", outline:c.v==="#ffffff"?"1px solid rgba(0,0,0,0.07)":"none", transition:"all 0.2s", transform:frameColor===c.v?"scale(1.18)":"scale(1)" }}/>
                ))}
              </div>
            </div>
          )}

          {tab==="filter"&&(
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:"#9B7B90", marginBottom:14 }}>Photo Filter</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                {FILTERS.map(f=>(
                  <button key={f.id} onClick={()=>setFilter(f.id)} style={{ borderRadius:12, border:`2px solid ${filter===f.id?"#C85B82":"transparent"}`, padding:0, cursor:"pointer", overflow:"hidden", boxShadow:filter===f.id?"0 2px 14px rgba(200,91,130,0.3)":"0 1px 4px rgba(0,0,0,0.07)", transform:filter===f.id?"scale(1.06)":"scale(1)", transition:"all 0.2s" }}>
                    <div style={{ height:50, overflow:"hidden", background:"#eee" }}>
                      {selectedPhotos[0]&&<img src={selectedPhotos[0]} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", filter:f.css!=="none"?f.css:undefined }}/>}
                    </div>
                    <div style={{ padding:"6px 4px", background:"#fff", fontSize:11, fontWeight:filter===f.id?700:500, color:filter===f.id?"#C85B82":"#9B7B90", textAlign:"center", fontFamily:"'Nunito',sans-serif" }}>{f.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab==="stickers"&&(
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:"#9B7B90", marginBottom:5 }}>Add Stickers</p>
              <p style={{ fontSize:11, color:"#ccc", marginBottom:14 }}>Click to add at a random spot</p>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {STICKER_EMOJIS.map(e=>(
                  <button key={e} onClick={()=>addSticker(e)} style={{ fontSize:22, background:"rgba(200,91,130,0.06)", border:"1.5px solid rgba(200,91,130,0.1)", borderRadius:10, padding:"6px 8px", cursor:"pointer", transition:"all 0.15s", lineHeight:1 }}
                    onMouseEnter={el=>el.currentTarget.style.transform="scale(1.22)"}
                    onMouseLeave={el=>el.currentTarget.style.transform=""}
                  >{e}</button>
                ))}
              </div>
            </div>
          )}

          {tab==="text"&&(
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <p style={{ fontSize:13, fontWeight:700, color:"#9B7B90" }}>Names & Date</p>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input value={name1} onChange={e=>setName1(e.target.value)} placeholder="Your name" style={{ flex:1, padding:"10px 13px", borderRadius:10, border:"1.5px solid rgba(200,91,130,0.2)", fontFamily:"'Nunito',sans-serif", fontSize:14, color:"#2D1B2E", background:"#fff", outline:"none" }}/>
                <span style={{ color:"#C85B82", fontFamily:"'Dancing Script',cursive", fontSize:20, flexShrink:0 }}>♡</span>
                <input value={name2} onChange={e=>setName2(e.target.value)} placeholder="Partner name" style={{ flex:1, padding:"10px 13px", borderRadius:10, border:"1.5px solid rgba(200,91,130,0.2)", fontFamily:"'Nunito',sans-serif", fontSize:14, color:"#2D1B2E", background:"#fff", outline:"none" }}/>
              </div>
              <input value={date} onChange={e=>setDate(e.target.value)} style={{ padding:"10px 13px", borderRadius:10, border:"1.5px solid rgba(200,91,130,0.2)", fontFamily:"'Nunito',sans-serif", fontSize:14, color:"#2D1B2E", background:"#fff", outline:"none" }}/>
            </div>
          )}

          <button
            onClick={()=>onDone({frameColor,filter,stickers,name1,name2,date,offsets})}
            style={{ width:"100%", marginTop:28, padding:"15px", borderRadius:16, background:"linear-gradient(135deg,#C85B82,#BFA3D4)", color:"#fff", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:16, border:"none", cursor:"pointer", boxShadow:"0 6px 24px rgba(200,91,130,0.35)" }}
          >
            Develop My Strip ✦
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REVEAL SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function RevealScreen({ stripUrl, isRevealing, downloadStatus, onDownload, onShare, onStartAgain }:{
  stripUrl:string; isRevealing:boolean; downloadStatus:"idle"|"working"|"done"|"error";
  onDownload:()=>void; onShare:()=>void; onStartAgain:()=>void
}) {
  const [dots,   setDots]    = useState(".")
  const [showStrip, setShow] = useState(false)

  useEffect(()=>{
    if(!isRevealing){ setTimeout(()=>setShow(true),200); return }
    const t=setInterval(()=>setDots(d=>d.length>=3?".":d+"."),480)
    return ()=>clearInterval(t)
  },[isRevealing])

  return (
    <div className="screen-enter" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 24px", background:isRevealing?"linear-gradient(160deg,#180810,#2d0e1a)":"linear-gradient(160deg,#FDF2F8,#FDF7F2)", fontFamily:"'Nunito',sans-serif", position:"relative", overflow:"hidden", transition:"background 1.4s ease" }}>
      <div className="grain-overlay" />

      {/* Darkroom ambient light */}
      {isRevealing&&<div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 50% 10%,rgba(200,30,60,0.15) 0%,transparent 65%)", pointerEvents:"none" }}/>}

      <div style={{ position:"relative", zIndex:10, textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:20 }}>
        {isRevealing?(
          <>
            <div style={{ fontSize:52, animation:"heartbeat 1.6s ease infinite" }}>🌹</div>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:36, color:"#e8a0b0", margin:0 }}>Developing{dots}</h2>
            <p style={{ color:"rgba(232,160,176,0.58)", fontSize:15 }}>Your memories are being printed…</p>
            <div style={{ width:220, height:4, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", background:"linear-gradient(90deg,#C85B82,#e8a0b0)", borderRadius:2, width:"60%", backgroundSize:"200% 100%", animation:"shimmerBar 1.4s linear infinite" }}/>
            </div>
          </>
        ):(
          <>
            <p style={{ fontSize:11, letterSpacing:"0.22em", color:"#C85B82", fontWeight:700, margin:0 }}>✦  YOUR STRIP IS READY  ✦</p>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:36, color:"#2D1B2E", margin:0 }}>Here you are, together.</h2>
            <p style={{ color:"#9B7B90", fontSize:15 }}>Download or share your print — cherish it forever.</p>

            {/* Strip reveal */}
            {stripUrl&&showStrip&&(
              <div style={{ animation:"stripSlide 0.95s cubic-bezier(0.22,1,0.36,1) forwards", boxShadow:"0 28px 80px rgba(0,0,0,0.22)", borderRadius:10, overflow:"hidden", maxHeight:"58vh" }}>
                <img src={stripUrl} alt="Your photo strip" style={{ display:"block", maxHeight:"58vh", maxWidth:"88vw", animation:"developing 2.4s ease forwards" }}/>
              </div>
            )}

            {/* Actions */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, justifyContent:"center", marginTop:6 }}>
              <button disabled={downloadStatus==="working"} onClick={onDownload} style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 28px", borderRadius:50, background:"linear-gradient(135deg,#C85B82,#BFA3D4)", color:"#fff", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:15, border:"none", cursor:downloadStatus==="working"?"wait":"pointer", opacity:downloadStatus==="working"?.72:1, boxShadow:"0 6px 24px rgba(200,91,130,0.42)" }}>
                <Download size={15}/>{downloadStatus==="working"?"Preparing…":"Download Strip"}
              </button>
              <button onClick={onShare} style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 26px", borderRadius:50, background:"transparent", border:"1.5px solid rgba(200,91,130,0.35)", color:"#C85B82", fontFamily:"'Nunito',sans-serif", fontWeight:600, fontSize:15, cursor:"pointer" }}>
                <Share2 size={15}/>Share
              </button>
              <button onClick={onStartAgain} style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 22px", borderRadius:50, background:"transparent", border:"1.5px solid rgba(0,0,0,0.1)", color:"#9B7B90", fontFamily:"'Nunito',sans-serif", fontWeight:600, fontSize:15, cursor:"pointer" }}>
                <RotateCcw size={14}/>Start Again
              </button>
            </div>
            {downloadStatus!=="idle"&&downloadStatus!=="working"&&(
              <p style={{ margin:0, fontSize:12, color:downloadStatus==="error"?"#dc2626":"#9B7B90" }}>
                {downloadStatus==="done"?"Downloaded directly to your device — nothing was uploaded.":"Download failed. Please try again."}
              </p>
            )}

            {/* GIF teaser */}
            <div style={{ marginTop:10, padding:"14px 22px", borderRadius:14, background:"rgba(200,91,130,0.05)", border:"1px dashed rgba(200,91,130,0.22)", maxWidth:360 }}>
              <p style={{ fontSize:12, color:"#9B7B90", lineHeight:1.65, margin:0 }}>
                🎬 <strong>Coming soon:</strong> Animated GIF & video recap of all 10 shots — export your whole session as a mini film.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const initialRoom=new URLSearchParams(window.location.search).get("room")?.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)||""
  const [screen,  setScreen]  = useState<Screen>(initialRoom.length===6?"room":"landing")
  const [layout,  setLayout]  = useState<Layout>("classic")
  const [themeId, setThemeId] = useState<ThemeId>("classic")
  const [propId,  setPropId]  = useState<PropId>("none")
  const [frontParticipant,setFrontParticipant]=useState<ParticipantId>("p1")
  const [skinSmoothing,setSkinSmoothing]=useState<SkinSmoothing>(0)
  const [partnerSkinSmoothing,setPartnerSkinSmoothing]=useState<SkinSmoothing>(0)
  const [roomCode,setRoomCode]= useState(initialRoom||genCode)
  const [isHost,setIsHost]    = useState(!initialRoom)
  const [partnerJoined, setPartnerJoined] = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [stream,  setStream]  = useState<MediaStream|null>(null)
  const [remoteStream,setRemoteStream]=useState<MediaStream|null>(null)
  const [pendingMediaCall,setPendingMediaCall]=useState<MediaConnection|null>(null)
  const [captureAt,setCaptureAt]=useState<number|null>(null)
  const [photos,  setPhotos]  = useState<string[]>([])
  const [selected,setSelected]= useState<number[]>([])
  const [tipIdx,  setTipIdx]  = useState(0)
  const [stripUrl,setStripUrl]= useState("")
  const [revealing,setRevealing]=useState(false)
  const [downloadStatus,setDownloadStatus]=useState<"idle"|"working"|"done"|"error">("idle")
  const peerRef=useRef<Peer|null>(null)
  const dataRef=useRef<DataConnection|null>(null)
  const mediaRef=useRef<MediaConnection|null>(null)
  const syncRef=useRef({screen,layout,themeId,propId})
  const beautyRef=useRef<SkinSmoothing>(skinSmoothing)
  const frontRef=useRef<ParticipantId>(frontParticipant)

  useEffect(()=>{ syncRef.current={screen,layout,themeId,propId} },[screen,layout,themeId,propId])
  useEffect(()=>{ beautyRef.current=skinSmoothing },[skinSmoothing])
  useEffect(()=>{ frontRef.current=frontParticipant },[frontParticipant])

  const sendMessage=(message:SyncMessage)=>{
    if(dataRef.current?.open) dataRef.current.send(message)
  }

  const navigate=(next:Screen)=>{
    setScreen(next)
    sendMessage({type:"STATE",screen:next,layout,themeId,propId})
  }

  const chooseLayout=(next:Layout)=>{
    setLayout(next)
    sendMessage({type:"STATE",screen,layout:next,themeId,propId})
  }

  const chooseTheme=(next:ThemeId)=>{
    setThemeId(next)
    sendMessage({type:"STATE",screen,layout,themeId:next,propId})
  }

  const chooseProp=(next:PropId)=>{
    setPropId(next)
    sendMessage({type:"STATE",screen,layout,themeId,propId:next})
  }

  const chooseSkinSmoothing=(next:SkinSmoothing)=>{
    setSkinSmoothing(next)
    beautyRef.current=next
    sendMessage({type:"BEAUTY",strength:next})
  }

  const chooseFrontParticipant=(next:ParticipantId)=>{
    setFrontParticipant(next)
    frontRef.current=next
    sendMessage({type:"FRONT",participant:next})
  }

  // PeerJS provides signaling; media and state updates travel peer-to-peer.
  useEffect(()=>{
    if(screen==="landing") return
    const ownId=`duet-${roomCode}-${isHost?"host":"guest"}`
    const hostId=`duet-${roomCode}-host`
    const peer=new Peer(ownId,{debug:1})
    peerRef.current=peer

    const attachData=(connection:DataConnection)=>{
      dataRef.current=connection
      connection.on("open",()=>{
        setPartnerJoined(true)
        if(isHost) connection.send({type:"STATE",...syncRef.current} satisfies SyncMessage)
        if(isHost) connection.send({type:"FRONT",participant:frontRef.current} satisfies SyncMessage)
        connection.send({type:"BEAUTY",strength:beautyRef.current} satisfies SyncMessage)
      })
      connection.on("data",raw=>{
        const message=raw as SyncMessage
        if(message.type==="STATE"){
          setScreen(message.screen);setLayout(message.layout);setThemeId(message.themeId);setPropId(message.propId||"none")
        }
        if(message.type==="BEAUTY") setPartnerSkinSmoothing(message.strength===2?2:message.strength===1?1:0)
        if(message.type==="FRONT") setFrontParticipant(message.participant==="p2"?"p2":"p1")
        if(message.type==="CAPTURE") setCaptureAt(message.at)
      })
      connection.on("close",()=>{ setPartnerJoined(false); setRemoteStream(null);setPartnerSkinSmoothing(0) })
    }

    peer.on("open",()=>{ if(!isHost) attachData(peer.connect(hostId,{reliable:true})) })
    peer.on("connection",attachData)
    peer.on("call",call=>setPendingMediaCall(call))
    peer.on("error",error=>{
      console.error("Peer connection error",error)
      if(error.type!=="peer-unavailable") setPartnerJoined(false)
    })

    return ()=>{
      dataRef.current?.close(); mediaRef.current?.close(); peer.destroy()
      dataRef.current=null; mediaRef.current=null; peerRef.current=null
    }
  },[roomCode,isHost])

  // Tips rotation
  useEffect(()=>{
    if(screen!=="ready") return
    const t=setInterval(()=>setTipIdx(i=>(i+1)%TIPS.length),3200)
    return ()=>clearInterval(t)
  },[screen])

  // Camera lifecycle
  useEffect(()=>{
    let active=true
    if(screen==="ready"||screen==="booth"){
      const demoParticipant=import.meta.env.DEV?new URLSearchParams(window.location.search).get("demo"):null
      const demoPose=new URLSearchParams(window.location.search).get("demoPose")||"full"
      const demoMotion=new URLSearchParams(window.location.search).get("demoMotion")==="1"
      const cameraPromise=demoParticipant==="p1"||demoParticipant==="p2"
        ? createLocalDemoStream(demoParticipant,demoPose,demoMotion)
        : navigator.mediaDevices.getUserMedia({ video:{ facingMode:"user", width:{ideal:1280}, height:{ideal:720} }, audio:true })
      if(!stream) cameraPromise
        .then(s=>{ if(active) setStream(s); else s.getTracks().forEach(t=>t.stop()) }).catch(()=>{})
    } else {
      setStream(prev=>{ prev?.getTracks().forEach(t=>t.stop()); return null })
    }
    return ()=>{ active=false }
  },[screen])

  // Once both cameras are ready, the guest calls the host. The host answers with its stream.
  useEffect(()=>{
    if(!stream||!partnerJoined) return
    const wire=(call:MediaConnection)=>{
      mediaRef.current=call
      call.on("stream",remote=>setRemoteStream(remote))
      call.on("close",()=>setRemoteStream(null))
    }
    if(isHost&&pendingMediaCall&&!mediaRef.current){
      pendingMediaCall.answer(stream); wire(pendingMediaCall); setPendingMediaCall(null)
    }
    if(!isHost&&peerRef.current&&!mediaRef.current){
      const call=peerRef.current.call(`duet-${roomCode}-host`,stream); wire(call)
    }
  },[stream,partnerJoined,pendingMediaCall,isHost,roomCode])

  const handleCopy=()=>{
    const invite=`${window.location.origin}${window.location.pathname}?room=${roomCode}`
    navigator.clipboard.writeText(invite).catch(()=>{})
    setCopied(true); setTimeout(()=>setCopied(false),2000)
  }

  const startSession=(joinCode?:string)=>{
    const nextCode=joinCode||genCode()
    setRoomCode(nextCode); setIsHost(!joinCode); setPartnerJoined(false)
    const params=new URLSearchParams({room:nextCode})
    const demoParticipant=import.meta.env.DEV?new URLSearchParams(window.location.search).get("demo"):null
    if(demoParticipant==="p1"||demoParticipant==="p2") params.set("demo",demoParticipant)
    const demoPose=new URLSearchParams(window.location.search).get("demoPose")
    if(import.meta.env.DEV&&demoPose) params.set("demoPose",demoPose)
    if(import.meta.env.DEV&&new URLSearchParams(window.location.search).get("demoOverlap")==="1") params.set("demoOverlap","1")
    if(import.meta.env.DEV&&new URLSearchParams(window.location.search).get("demoMotion")==="1") params.set("demoMotion","1")
    window.history.replaceState({},"",`${window.location.pathname}?${params}`)
    setScreen("room")
  }

  const requestCapture=()=>{
    const at=Date.now()+5200
    setCaptureAt(at); sendMessage({type:"CAPTURE",at})
  }

  const toggleSelect=(i:number)=>{
    const need=layout==="classic"?4:6
    setSelected(prev=>prev.includes(i)?prev.filter(x=>x!==i):prev.length>=need?prev:[...prev,i])
  }

  const handleCustomizeDone=async({ frameColor,filter,stickers,name1,name2,date,offsets }:CustomizeOpts)=>{
    setRevealing(true); navigate("reveal")
    const need=layout==="classic"?4:6
    const sel=selected.slice(0,need).map(i=>photos[i])
    const filterCSS=FILTERS.find(f=>f.id===filter)?.css||"none"
    const isDark=frameColor==="#1a1a1a"
    const cols=layout==="classic"?1:2
    const rows=layout==="classic"?4:3
    const pad=28, gap=12
    const photoH=layout==="classic"?420:310
    const hdr=72, ftr=92
    const stripW=layout==="classic"?800:1120
    const stripH=hdr+pad+rows*photoH+(rows-1)*gap+pad+ftr

    const canvas=document.createElement("canvas")
    canvas.width=stripW; canvas.height=stripH
    const ctx=canvas.getContext("2d")!

    ctx.fillStyle=frameColor; ctx.fillRect(0,0,stripW,stripH)
    ctx.textAlign="center"; ctx.fillStyle=isDark?"rgba(255,255,255,0.45)":"#C85B82"
    ctx.font="700 20px Nunito,sans-serif"
    ctx.fillText("duet  ♡",stripW/2,hdr-16)

    const loadImg=(src:string)=>new Promise<HTMLImageElement>(res=>{ const img=new Image(); img.onload=()=>res(img); img.src=src })

    for(let i=0;i<sel.length;i++){
      const col=i%cols, row=Math.floor(i/cols)
      const pw=(stripW-pad*2-gap*(cols-1))/cols
      const x=pad+col*(pw+gap), y=hdr+pad+row*(photoH+gap)
      const img=await loadImg(sel[i])
      const scale=Math.max(pw/img.width,photoH/img.height)*1.12
      const dw=img.width*scale, dh=img.height*scale
      const off=offsets[i]||{x:0,y:0}
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,pw,photoH); ctx.clip()
      if(filterCSS!=="none") ctx.filter=filterCSS
      ctx.drawImage(img,x+(pw-dw)/2+off.x*2,y+(photoH-dh)/2+off.y*2,dw,dh); ctx.restore()
    }

    // Stickers
    stickers.forEach(s=>{
      ctx.save()
      ctx.translate((s.x/100)*stripW,(s.y/100)*(stripH-ftr))
      ctx.rotate((s.rot*Math.PI)/180)
      ctx.font="44px serif"; ctx.fillText(s.emoji,0,0)
      ctx.restore()
    })

    // Footer
    const fY=stripH-ftr
    ctx.fillStyle=isDark?"rgba(255,255,255,0.05)":"rgba(200,91,130,0.05)"; ctx.fillRect(0,fY,stripW,ftr)
    ctx.textAlign="center"
    ctx.font="400 30px 'Dancing Script',cursive"
    ctx.fillStyle=isDark?"rgba(255,255,255,0.65)":"#9B7B90"
    ctx.fillText(name1&&name2?`${name1}  ♡  ${name2}`:"Together ♡",stripW/2,fY+44)
    ctx.font="400 20px Nunito,sans-serif"
    ctx.fillStyle=isDark?"rgba(255,255,255,0.32)":"#ccc"
    ctx.fillText(date,stripW/2,fY+76)

    setStripUrl(canvas.toDataURL("image/png"))
    setTimeout(()=>setRevealing(false),2900)
  }

  const handleStartAgain=()=>{
    dataRef.current?.close(); mediaRef.current?.close(); peerRef.current?.destroy()
    stream?.getTracks().forEach(track=>track.stop())
    setPhotos([]); setSelected([]); setStripUrl(""); setPartnerJoined(false); setRevealing(false); setDownloadStatus("idle")
    setRemoteStream(null); setCaptureAt(null); setStream(null);setSkinSmoothing(0);setPartnerSkinSmoothing(0);setFrontParticipant("p1")
    window.history.replaceState({},"",window.location.pathname)
    setScreen("landing")
  }

  const handleDownload=async()=>{
    if(!stripUrl||downloadStatus==="working") return
    setDownloadStatus("working")
    try{
      await downloadStrip(stripUrl)
      setDownloadStatus("done")
    }catch(error){
      console.error("Strip download failed",error)
      setDownloadStatus("error")
    }
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ fontFamily:"'Nunito',sans-serif" }}>
        {screen==="landing"  && <LandingScreen onStart={startSession}/>} 
        {screen==="room"     && <RoomScreen code={roomCode} partnerJoined={partnerJoined} copied={copied} onCopy={handleCopy} onContinue={()=>navigate("layout")}/>} 
        {screen==="layout"   && <LayoutScreen selected={layout} onSelect={chooseLayout} onContinue={()=>navigate("theme")}/>} 
        {screen==="theme"    && <ThemeScreen selected={themeId} selectedProp={propId} onSelect={chooseTheme} onPropSelect={chooseProp} onContinue={()=>navigate("ready")}/>}
        {screen==="ready"&&(
          <GetReadyScreen
            stream={stream}
            remoteStream={remoteStream}
            tipIndex={tipIdx}
            skinSmoothing={skinSmoothing}
            onSkinSmoothingChange={chooseSkinSmoothing}
            onContinue={()=>{ setPhotos([]);setSelected([]);navigate("booth") }}
          />
        )}
        {screen==="booth"    && (
          <BoothScreen
            stream={stream} remoteStream={remoteStream} themeId={themeId} propId={propId} skinSmoothing={skinSmoothing} partnerSkinSmoothing={partnerSkinSmoothing} frontParticipant={frontParticipant} localParticipant={isHost?"p1":"p2"} layout={layout} captureAt={captureAt}
            onFrontParticipantChange={chooseFrontParticipant}
            onCaptureRequest={requestCapture}
            onPhotoCapture={url=>setPhotos(p=>[...p,url])}
            onDone={()=>navigate("select")}
          />
        )}
        {screen==="select"   && <SelectScreen photos={photos} selected={selected} layout={layout} onToggle={toggleSelect} onContinue={()=>navigate("customize")}/>} 
        {screen==="customize"&& <CustomizeScreen photos={photos} selectedIndices={selected} layout={layout} onDone={handleCustomizeDone}/>}
        {screen==="reveal"&&(
          <RevealScreen
            stripUrl={stripUrl}
            isRevealing={revealing}
            downloadStatus={downloadStatus}
            onDownload={handleDownload}
            onShare={()=>{
              if(navigator.share) navigator.share({title:"Our duet photo strip",text:"Look what we made together ♡"}).catch(()=>{})
              else navigator.clipboard.writeText(window.location.href).catch(()=>{})
            }}
            onStartAgain={handleStartAgain}
          />
        )}
      </div>
    </>
  )
}
