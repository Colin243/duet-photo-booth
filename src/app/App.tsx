import { useState, useEffect, useRef, useCallback } from "react"
import Peer, { type DataConnection, type MediaConnection } from "peerjs"
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
type ThemeId = "classic"|"washer"|"elevator"|"airplane"|"kitchen"|"cctv"|"arcade"
type FilterId = "none"|"warm"|"cool"|"film"|"bw"|"vivid"

type SyncMessage =
  | { type:"STATE"; screen:Screen; layout:Layout; themeId:ThemeId }
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
  { id:"classic",  name:"Classic",         emoji:"✦", tagline:"Timeless white booth",    previewBg:"linear-gradient(160deg,#fff5f8,#fce4ec)",          dark:false, accent:"#C85B82" },
  { id:"washer",   name:"Washing Machine", emoji:"◎", tagline:"Inside the drum",          previewBg:"linear-gradient(160deg,#e3f2fd,#bbdefb)",          dark:false, accent:"#1976D2" },
  { id:"elevator", name:"Elevator",        emoji:"↕", tagline:"Mirrored walls, going up",previewBg:"linear-gradient(180deg,#c8c8c8,#f0f0f0 50%,#c8c8c8)",dark:false,accent:"#546E7A"},
  { id:"airplane", name:"Airplane",        emoji:"✈️", tagline:"Up in the clouds",        previewBg:"linear-gradient(160deg,#81d4fa,#e1f5fe 65%,#fff)",  dark:false, accent:"#0288D1" },
  { id:"kitchen",  name:"Kitchen",         emoji:"◫", tagline:"Morning light, together", previewBg:"linear-gradient(160deg,#fff8e1,#ffecb3)",          dark:false, accent:"#E65100" },
  { id:"cctv",     name:"CCTV",            emoji:"REC", tagline:"Secret surveillance",     previewBg:"#0a0a0a",                                          dark:true,  accent:"#00ff41" },
  { id:"arcade",   name:"Arcade",          emoji:"★", tagline:"Neon lights, high score", previewBg:"linear-gradient(160deg,#0d0221,#1a0533)",          dark:true,  accent:"#e040fb" },
]

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

function drawThemeBg(ctx:CanvasRenderingContext2D, id:ThemeId, W:number, H:number) {
  switch(id) {
    case "classic":  ctx.fillStyle = mkLinear(ctx,0,0,W,H,[[0,"#fff5f8"],[1,"#fce4ec"]]); break
    case "washer":   ctx.fillStyle = mkLinear(ctx,0,0,W,H,[[0,"#e3f2fd"],[1,"#bbdefb"]]); break
    case "elevator": ctx.fillStyle = mkLinear(ctx,0,0,0,H,[[0,"#b8b8b8"],[0.35,"#eeeeee"],[0.65,"#eeeeee"],[1,"#b8b8b8"]]); break
    case "airplane": ctx.fillStyle = mkLinear(ctx,0,0,0,H,[[0,"#81d4fa"],[0.6,"#e1f5fe"],[1,"#ffffff"]]); break
    case "kitchen":  ctx.fillStyle = mkLinear(ctx,0,0,W,H,[[0,"#fff8e1"],[1,"#ffecb3"]]); break
    case "cctv":     ctx.fillStyle = "#0a0a0a"; break
    case "arcade":   ctx.fillStyle = mkLinear(ctx,0,0,0,H,[[0,"#0d0221"],[1,"#1a0533"]]); break
  }
  ctx.fillRect(0,0,W,H)
}

function drawThemeDetails(ctx:CanvasRenderingContext2D, id:ThemeId, W:number, H:number) {
  switch(id) {
    case "elevator": {
      // Ceiling lamp
      const lg = ctx.createLinearGradient(0,0,0,H*0.14)
      lg.addColorStop(0,"rgba(255,255,240,0.85)"); lg.addColorStop(1,"rgba(255,255,240,0)")
      ctx.fillStyle=lg; ctx.fillRect(W*0.28,0,W*0.44,H*0.14)
      // Mirror seam lines
      ctx.strokeStyle="rgba(160,160,160,0.35)"; ctx.lineWidth=1
      ;[0.25,0.5,0.75].forEach(x=>{ ctx.beginPath(); ctx.moveTo(W*x,0); ctx.lineTo(W*x,H); ctx.stroke() })
      // Floor sheen
      const fg2 = ctx.createLinearGradient(0,H*0.78,0,H)
      fg2.addColorStop(0,"rgba(160,160,160,0)"); fg2.addColorStop(1,"rgba(140,140,140,0.28)")
      ctx.fillStyle=fg2; ctx.fillRect(0,H*0.78,W,H*0.22)
      break
    }
    case "airplane": {
      // Clouds
      const clouds:number[][] = [[W*.06,H*.18,55],[W*.62,H*.09,70],[W*.38,H*.28,45],[W*.82,H*.38,62]]
      clouds.forEach(([cx,cy,r])=>{
        ctx.fillStyle="rgba(255,255,255,0.52)"
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2)
        ctx.arc(cx+r*.7,cy-r*.28,r*.68,0,Math.PI*2)
        ctx.arc(cx+r*1.35,cy,r*.82,0,Math.PI*2)
        ctx.fill()
      })
      // Porthole frame
      ctx.save()
      const pw=W*.74, ph=H*.86, px=W*.13, py=H*.07
      ctx.beginPath(); rRect(ctx,px,py,pw,ph,pw*.5)
      ctx.strokeStyle="rgba(144,202,249,0.55)"; ctx.lineWidth=18; ctx.stroke()
      ctx.strokeStyle="rgba(255,255,255,0.28)"; ctx.lineWidth=4
      ctx.beginPath(); rRect(ctx,px+10,py+10,pw-20,ph-20,pw*.5)
      ctx.stroke(); ctx.restore()
      break
    }
    case "washer": {
      // Porthole ring
      ctx.save()
      const r = Math.min(W,H)*.44
      ctx.beginPath(); ctx.arc(W/2,H/2,r,0,Math.PI*2)
      ctx.strokeStyle="rgba(100,181,246,0.6)"; ctx.lineWidth=22; ctx.stroke()
      ctx.beginPath(); ctx.arc(W/2,H/2,r+14,0,Math.PI*2)
      ctx.strokeStyle="rgba(187,222,251,0.3)"; ctx.lineWidth=8; ctx.stroke()
      ctx.restore()
      // Soap bubbles
      ;([[W*.08,H*.19,13],[W*.87,H*.34,19],[W*.76,H*.13,9],[W*.18,H*.82,15],[W*.92,H*.68,11]] as number[][]).forEach(([bx,by,br])=>{
        ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2)
        ctx.strokeStyle="rgba(144,202,249,0.52)"; ctx.lineWidth=1.5; ctx.stroke()
        ctx.fillStyle="rgba(255,255,255,0.10)"; ctx.fill()
      })
      break
    }
    case "kitchen": {
      // Warm top light
      const sg = ctx.createRadialGradient(W/2,0,0,W/2,0,H*.6)
      sg.addColorStop(0,"rgba(255,230,160,0.38)"); sg.addColorStop(1,"rgba(255,230,160,0)")
      ctx.fillStyle=sg; ctx.fillRect(0,0,W,H)
      // Tile grid
      ctx.strokeStyle="rgba(255,213,79,0.18)"; ctx.lineWidth=1
      for(let x=0;x<W;x+=42){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H*.18); ctx.stroke() }
      for(let y=0;y<H*.18;y+=42){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke() }
      break
    }
    case "cctv": {
      ctx.fillStyle="rgba(0,55,0,0.22)"; ctx.fillRect(0,0,W,H)
      ctx.fillStyle="rgba(0,18,0,0.24)"
      for(let y=0;y<H;y+=4) ctx.fillRect(0,y,W,2)
      // Timestamp bar
      ctx.fillStyle="rgba(0,0,0,0.78)"; ctx.fillRect(0,H-40,W,40)
      ctx.fillStyle="#00ff41"; ctx.font="bold 12px monospace"; ctx.textAlign="left"
      ctx.fillText(`REC ● ${new Date().toLocaleString("en-US")}  CAM-02`,10,H-14)
      ctx.textAlign="right"; ctx.fillStyle="rgba(0,255,65,0.6)"; ctx.font="11px monospace"
      ctx.fillText("♦ SECURE FEED",W-10,22)
      // REC dot
      ctx.fillStyle="#ff2222"
      ctx.beginPath(); ctx.arc(W-22,18,7,0,Math.PI*2); ctx.fill()
      break
    }
    case "arcade": {
      ctx.save()
      ctx.strokeStyle="#e040fb"; ctx.lineWidth=5
      ctx.shadowColor="#e040fb"; ctx.shadowBlur=28
      ctx.strokeRect(3,3,W-6,H-6)
      ctx.strokeStyle="#7c4dff"; ctx.lineWidth=2; ctx.shadowBlur=14
      ctx.strokeRect(10,10,W-20,H-20)
      ctx.restore()
      // Scanlines
      ctx.fillStyle="rgba(0,0,0,0.11)"
      for(let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1)
      // Player tags
      ctx.save()
      ctx.fillStyle="#e040fb"; ctx.font="bold 13px monospace"
      ctx.shadowColor="#e040fb"; ctx.shadowBlur=10
      ctx.textAlign="left"; ctx.fillText("1P",18,32)
      ctx.textAlign="right"; ctx.fillText("2P",W-18,32)
      ctx.fillStyle="#b388ff"; ctx.font="11px monospace"; ctx.shadowBlur=6
      ctx.textAlign="center"; ctx.fillText("★ HIGH SCORE ★",W/2,30)
      ctx.restore()
      break
    }
  }
}

function drawVignette(ctx:CanvasRenderingContext2D, W:number, H:number, strength=0.3) {
  const g = ctx.createRadialGradient(W/2,H/2,H*.15,W/2,H/2,H*.88)
  g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,`rgba(0,0,0,${strength})`)
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H)
}

function drawBoothFrame(
  ctx:CanvasRenderingContext2D,
  video:HTMLVideoElement,
  partnerVideo:HTMLVideoElement|null,
  W:number, H:number,
  themeId:ThemeId,
  proximity:number
) {
  ctx.clearRect(0,0,W,H)
  drawThemeBg(ctx,themeId,W,H)

  const pW=W*.415, pH=H*.82, pY=H*.09
  const maxGap=W*.13, minGap=-pW*.22
  const gap=maxGap-(proximity/100)*(maxGap-minGap)
  const youX=W/2-pW-gap/2
  const partX=W/2+gap/2

  if(video.readyState>=2) {
    // You — left
    ctx.save(); ctx.beginPath(); rRect(ctx,youX,pY,pW,pH,8); ctx.clip()
    ctx.drawImage(video,youX,pY,pW,pH); ctx.restore()

    // Partner — right. Falls back to the mirrored local feed until WebRTC connects.
    const partner = partnerVideo?.readyState && partnerVideo.readyState>=2 ? partnerVideo : video
    ctx.save(); ctx.beginPath(); rRect(ctx,partX,pY,pW,pH,8); ctx.clip()
    ctx.translate(partX*2+pW,0); ctx.scale(-1,1)
    ctx.drawImage(partner,partX,pY,pW,pH); ctx.restore()

    // Soft overlap blend when very close
    if(proximity>72 && gap<0){
      const ovX=Math.max(youX,partX), ovW=youX+pW-partX
      if(ovW>2){
        ctx.save(); ctx.beginPath(); rRect(ctx,ovX,pY,ovW,pH,0); ctx.clip()
        ctx.globalAlpha=0.38; ctx.globalCompositeOperation="multiply"
        ctx.drawImage(video,partX,pY,pW,pH); ctx.restore()
      }
    }

    // CCTV: apply green tint on top of people
    if(themeId==="cctv"){
      ctx.save(); ctx.beginPath()
      rRect(ctx,youX,pY,pW,pH,8); ctx.clip()
      ctx.fillStyle="rgba(0,40,0,0.15)"; ctx.fillRect(youX,pY,pW,pH)
      ctx.restore()
      ctx.save(); ctx.beginPath()
      rRect(ctx,partX,pY,pW,pH,8); ctx.clip()
      ctx.fillStyle="rgba(0,40,0,0.15)"; ctx.fillRect(partX,pY,pW,pH)
      ctx.restore()
    }
  }

  drawThemeDetails(ctx,themeId,W,H)
  if(!["cctv","arcade"].includes(themeId)) drawVignette(ctx,W,H)
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

function ThemeScreen({ selected, onSelect, onContinue }:{
  selected:ThemeId; onSelect:(t:ThemeId)=>void; onContinue:()=>void
}) {
  return (
    <div className="screen-enter" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px", background:"#FDF8F4", fontFamily:"'Nunito',sans-serif", position:"relative" }}>
      <div className="grain-overlay" />
      <div style={{ position:"relative", zIndex:10, width:"100%", maxWidth:680, textAlign:"center" }}>
        <p style={{ fontSize:11, letterSpacing:"0.2em", color:"#C85B82", marginBottom:10, fontWeight:700 }}>STEP  2 / 3</p>
        <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:34, color:"#2D1B2E", marginBottom:8 }}>Choose your scene</h2>
        <p style={{ color:"#9B7B90", marginBottom:32, fontSize:15 }}>Backgrounds, overlays, and effects transport you both somewhere special.</p>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(156px,1fr))", gap:12, marginBottom:32 }}>
          {THEMES.map(t=>(
            <button key={t.id} onClick={()=>onSelect(t.id)} style={{ background:t.previewBg, borderRadius:18, padding:"24px 14px", border:`2.5px solid ${selected===t.id?t.accent:"transparent"}`, cursor:"pointer", transition:"all 0.24s", boxShadow:selected===t.id?`0 4px 22px ${t.accent}55`:"0 2px 10px rgba(0,0,0,0.08)", transform:selected===t.id?"scale(1.04)":"scale(1)", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:26 }}>{t.emoji}</span>
              <span style={{ fontWeight:700, color:t.dark?"#fff":"#2D1B2E", fontSize:14 }}>{t.name}</span>
              <span style={{ fontSize:11, color:t.dark?"rgba(255,255,255,0.62)":"#9B7B90", lineHeight:1.5 }}>{t.tagline}</span>
              {selected===t.id&&<div style={{ width:22, height:22, borderRadius:"50%", background:t.accent, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:`0 0 0 3px rgba(255,255,255,0.28)` }}><Check size={11} color="#fff" strokeWidth={3}/></div>}
            </button>
          ))}
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

function GetReadyScreen({ stream, remoteStream, tipIndex, onContinue }:{
  stream:MediaStream|null; remoteStream:MediaStream|null; tipIndex:number; onContinue:()=>void
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
          <video ref={vidRef} autoPlay playsInline muted style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)", display:"block" }}/>
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

        {/* Tip card */}
        <div style={{ margin:"0 auto 28px", maxWidth:400, background:"#fff", borderRadius:16, padding:"18px 24px", border:"1px solid rgba(200,91,130,0.12)", boxShadow:"0 2px 14px rgba(0,0,0,0.04)", textAlign:"left" }}>
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

function BoothScreen({ stream, remoteStream, themeId, layout, captureAt, onCaptureRequest, onPhotoCapture, onDone }:{
  stream:MediaStream|null; remoteStream:MediaStream|null; themeId:ThemeId; layout:Layout; captureAt:number|null;
  onCaptureRequest:()=>void; onPhotoCapture:(dataUrl:string)=>void; onDone:()=>void
}) {
  const vidRef      = useRef<HTMLVideoElement>(null)
  const partnerRef  = useRef<HTMLVideoElement>(null)
  const previewRef  = useRef<HTMLCanvasElement>(null)
  const captureRef  = useRef<HTMLCanvasElement>(null)
  const rafRef      = useRef<number>()
  const timerRef    = useRef<ReturnType<typeof setInterval>>()
  const [photos, setPhotos]     = useState<string[]>([])
  const [countdown, setCountdown] = useState<number|null>(null)
  const [flashing, setFlashing]   = useState(false)
  const [proximity, setProximity] = useState(50)
  const [poked, setPoked]         = useState(false)

  const theme  = THEMES.find(t=>t.id===themeId)!
  const isDark = theme.dark
  const MAX    = 10
  const needed = layout==="classic"?4:6

  useEffect(()=>{
    if(stream&&vidRef.current){ vidRef.current.srcObject=stream; vidRef.current.play().catch(()=>{}) }
  },[stream])

  useEffect(()=>{
    if(remoteStream&&partnerRef.current){ partnerRef.current.srcObject=remoteStream; partnerRef.current.play().catch(()=>{}) }
  },[remoteStream])

  // Animation loop
  useEffect(()=>{
    const canvas=previewRef.current, video=vidRef.current
    if(!canvas||!video) return
    const ctx=canvas.getContext("2d")!
    const loop=()=>{ drawBoothFrame(ctx,video,partnerRef.current,canvas.width,canvas.height,themeId,proximity); rafRef.current=requestAnimationFrame(loop) }
    loop()
    return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current) }
  },[themeId,proximity])

  const doCapture = useCallback(()=>{
    const video=vidRef.current, canvas=captureRef.current
    if(!video||!canvas) return
    const ctx=canvas.getContext("2d")!
    drawBoothFrame(ctx,video,partnerRef.current,canvas.width,canvas.height,themeId,proximity)
    const url=canvas.toDataURL("image/jpeg",0.93)
    setPhotos(prev=>[...prev,url])
    onPhotoCapture(url)
    setPoked(true); setTimeout(()=>setPoked(false),900)
  },[themeId,proximity,onPhotoCapture])

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
    <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", fontFamily:"'Nunito',sans-serif", position:"relative", overflow:"hidden" }}>
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
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 14px", gap:14, position:"relative", zIndex:10 }}>
        <div style={{ position:"relative", borderRadius:22, overflow:"hidden", boxShadow:isDark?`0 0 0 2px ${theme.accent}44,0 18px 60px rgba(0,0,0,0.65)`:"0 10px 50px rgba(0,0,0,0.13)", maxWidth:"100%", width:"100%" }}>
          <canvas ref={previewRef} width={760} height={500} style={{ display:"block", width:"100%", maxWidth:760, aspectRatio:"760/500", borderRadius:22 }}/>

          {/* You / Partner labels */}
          <div style={{ position:"absolute", bottom:14, left:"17%", transform:"translateX(-50%)", background:"rgba(0,0,0,0.44)", backdropFilter:"blur(6px)", borderRadius:20, padding:"4px 12px" }}>
            <span style={{ fontSize:11, color:"#fff", fontWeight:600 }}>You</span>
          </div>
          <div style={{ position:"absolute", bottom:14, right:"14%", transform:"translateX(50%)", background:"rgba(0,0,0,0.44)", backdropFilter:"blur(6px)", borderRadius:20, padding:"4px 12px" }}>
            <span style={{ fontSize:11, color:"#fff", fontWeight:600 }}>Partner</span>
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
        <div style={{ width:120, fontSize:11, color:sub, lineHeight:1.4, textAlign:"right" }}>{photos.length<MAX?`${MAX-photos.length} moment${MAX-photos.length===1?"":"s"} left`:"All ten captured"}</div>

        {/* Shutter */}
        <button
          onClick={onCaptureRequest}
          disabled={countdown!==null||photos.length>=MAX}
          aria-label="Capture photo"
          style={{ width:72, height:72, borderRadius:"50%", background:countdown!==null||photos.length>=MAX?(isDark?"rgba(255,255,255,0.14)":"#e8e8e8"):acc, border:`4px solid ${isDark?"rgba(255,255,255,0.14)":"rgba(200,91,130,0.18)"}`, boxShadow:countdown!==null||photos.length>=MAX?"none":`0 6px 26px ${acc}80`, cursor:countdown!==null||photos.length>=MAX?"not-allowed":"pointer", transition:"all 0.2s", display:"flex", alignItems:"center", justifyContent:"center" }}
          onMouseEnter={e=>{ if(countdown===null&&photos.length<MAX) e.currentTarget.style.transform="scale(1.08)" }}
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

function RevealScreen({ stripUrl, isRevealing, onDownload, onShare, onStartAgain }:{
  stripUrl:string; isRevealing:boolean; onDownload:()=>void; onShare:()=>void; onStartAgain:()=>void
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
              <button onClick={onDownload} style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 28px", borderRadius:50, background:"linear-gradient(135deg,#C85B82,#BFA3D4)", color:"#fff", fontFamily:"'Nunito',sans-serif", fontWeight:700, fontSize:15, border:"none", cursor:"pointer", boxShadow:"0 6px 24px rgba(200,91,130,0.42)" }}>
                <Download size={15}/>Download Strip
              </button>
              <button onClick={onShare} style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 26px", borderRadius:50, background:"transparent", border:"1.5px solid rgba(200,91,130,0.35)", color:"#C85B82", fontFamily:"'Nunito',sans-serif", fontWeight:600, fontSize:15, cursor:"pointer" }}>
                <Share2 size={15}/>Share
              </button>
              <button onClick={onStartAgain} style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 22px", borderRadius:50, background:"transparent", border:"1.5px solid rgba(0,0,0,0.1)", color:"#9B7B90", fontFamily:"'Nunito',sans-serif", fontWeight:600, fontSize:15, cursor:"pointer" }}>
                <RotateCcw size={14}/>Start Again
              </button>
            </div>

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
  const peerRef=useRef<Peer|null>(null)
  const dataRef=useRef<DataConnection|null>(null)
  const mediaRef=useRef<MediaConnection|null>(null)
  const syncRef=useRef({screen,layout,themeId})

  useEffect(()=>{ syncRef.current={screen,layout,themeId} },[screen,layout,themeId])

  const sendMessage=(message:SyncMessage)=>{
    if(dataRef.current?.open) dataRef.current.send(message)
  }

  const navigate=(next:Screen)=>{
    setScreen(next)
    sendMessage({type:"STATE",screen:next,layout,themeId})
  }

  const chooseLayout=(next:Layout)=>{
    setLayout(next)
    sendMessage({type:"STATE",screen,layout:next,themeId})
  }

  const chooseTheme=(next:ThemeId)=>{
    setThemeId(next)
    sendMessage({type:"STATE",screen,layout,themeId:next})
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
      })
      connection.on("data",raw=>{
        const message=raw as SyncMessage
        if(message.type==="STATE"){
          setScreen(message.screen); setLayout(message.layout); setThemeId(message.themeId)
        }
        if(message.type==="CAPTURE") setCaptureAt(message.at)
      })
      connection.on("close",()=>{ setPartnerJoined(false); setRemoteStream(null) })
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
      if(!stream) navigator.mediaDevices.getUserMedia({ video:{ facingMode:"user", width:{ideal:1280}, height:{ideal:720} }, audio:true })
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
    window.history.replaceState({},"",`${window.location.pathname}?room=${nextCode}`)
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
    setPhotos([]); setSelected([]); setStripUrl(""); setPartnerJoined(false); setRevealing(false)
    setRemoteStream(null); setCaptureAt(null); setStream(null)
    window.history.replaceState({},"",window.location.pathname)
    setScreen("landing")
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ fontFamily:"'Nunito',sans-serif" }}>
        {screen==="landing"  && <LandingScreen onStart={startSession}/>} 
        {screen==="room"     && <RoomScreen code={roomCode} partnerJoined={partnerJoined} copied={copied} onCopy={handleCopy} onContinue={()=>navigate("layout")}/>} 
        {screen==="layout"   && <LayoutScreen selected={layout} onSelect={chooseLayout} onContinue={()=>navigate("theme")}/>} 
        {screen==="theme"    && <ThemeScreen selected={themeId} onSelect={chooseTheme} onContinue={()=>navigate("ready")}/>} 
        {screen==="ready"    && <GetReadyScreen stream={stream} remoteStream={remoteStream} tipIndex={tipIdx} onContinue={()=>{ setPhotos([]); setSelected([]); navigate("booth") }}/>} 
        {screen==="booth"    && (
          <BoothScreen
            stream={stream} remoteStream={remoteStream} themeId={themeId} layout={layout} captureAt={captureAt}
            onCaptureRequest={requestCapture}
            onPhotoCapture={url=>setPhotos(p=>[...p,url])}
            onDone={()=>navigate("select")}
          />
        )}
        {screen==="select"   && <SelectScreen photos={photos} selected={selected} layout={layout} onToggle={toggleSelect} onContinue={()=>navigate("customize")}/>} 
        {screen==="customize"&& <CustomizeScreen photos={photos} selectedIndices={selected} layout={layout} onDone={handleCustomizeDone}/>}
        {screen==="reveal"   && <RevealScreen stripUrl={stripUrl} isRevealing={revealing} onDownload={()=>{ const a=document.createElement("a"); a.href=stripUrl; a.download=`duet-${Date.now()}.png`; a.click() }} onShare={()=>{ if(navigator.share) navigator.share({title:"Our duet photo strip",text:"Look what we made together ♡"}).catch(()=>{}); else navigator.clipboard.writeText(window.location.href).catch(()=>{}) }} onStartAgain={handleStartAgain}/>} 
      </div>
    </>
  )
}
