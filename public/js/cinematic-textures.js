/* Original, illustrative interface textures for the marketing scene.
   These canvases never read application data or make network requests. */

const PALETTE = {
  lime: '#c4ff41',
  text: '#f3f5ef',
  muted: '#9da99a',
  quiet: '#687467',
  line: 'rgba(222, 243, 202, .105)'
};

function canvas(width, height) {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  return surface;
}

function round(ctx, x, y, width, height, radius = 16) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
  else {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
  }
  ctx.closePath();
}

function fillRound(ctx, x, y, width, height, radius, fill, stroke) {
  round(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
}

function latin(ctx, text, x, y, size = 18, color = PALETTE.quiet, align = 'left') {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function arabic(ctx, text, x, y, size = 34, color = PALETTE.text, weight = 400) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px "Pilot Arabic", "Noto Sans Arabic", Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function paragraph(ctx, text, x, y, maxWidth, size = 39, lineHeight = 67, maxLines = 2, color = PALETTE.text, weight = 600) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px "Pilot Arabic", "Noto Sans Arabic", Arial, sans-serif`;
  ctx.fillStyle = color;
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let final = visible[maxLines - 1];
    while (ctx.measureText(final + '…').width > maxWidth && final.length) final = final.slice(0, -1);
    visible[maxLines - 1] = final + '…';
  }
  visible.forEach((item, i) => ctx.fillText(item, x, y + i * lineHeight));
  ctx.restore();
  return visible.length;
}

function bubbleIcon(ctx, x, y, color = PALETTE.lime, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.3;
  round(ctx, -14, -12, 28, 21, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-4, 9); ctx.lineTo(-11, 15); ctx.lineTo(-10, 7);
  ctx.stroke();
  ctx.restore();
}

function sparkle(ctx, x, y, color = PALETTE.lime, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, -15); ctx.lineTo(4, -4); ctx.lineTo(15, 0); ctx.lineTo(4, 4);
  ctx.lineTo(0, 15); ctx.lineTo(-4, 4); ctx.lineTo(-15, 0); ctx.lineTo(-4, -4);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();
}

function basePanel(ctx, width, height) {
  const surface = ctx.createLinearGradient(0, 0, width, height);
  surface.addColorStop(0, '#171e18');
  surface.addColorStop(.4, '#101610');
  surface.addColorStop(1, '#090e0a');
  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);

  const wash = ctx.createRadialGradient(width, 0, 0, width, 0, width * .88);
  wash.addColorStop(0, 'rgba(196,255,65,.045)');
  wash.addColorStop(1, 'rgba(196,255,65,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  // Quiet horizontal material grain, not a moving effect.
  ctx.strokeStyle = 'rgba(230,255,224,.012)';
  ctx.lineWidth = 1;
  for (let y = 2; y < height; y += 7) {
    ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke();
  }
  fillRound(ctx, 1.5, 1.5, width - 3, height - 3, 30, 'rgba(0,0,0,0)', 'rgba(205,234,183,.19)');
  ctx.strokeStyle = 'rgba(226,255,194,.24)';
  ctx.beginPath(); ctx.moveTo(36, 2.5); ctx.lineTo(width - 36, 2.5); ctx.stroke();
}

function header(ctx, title, type, icon = 'message') {
  fillRound(ctx, 838, 37, 74, 74, 22, 'rgba(196,255,65,.065)', 'rgba(196,255,65,.14)');
  if (icon === 'sparkle') sparkle(ctx, 875, 74, PALETTE.lime, 1.1);
  else bubbleIcon(ctx, 875, 74, PALETTE.lime, 1.1);
  arabic(ctx, title, 808, 73, 33, PALETTE.text, 600);
  latin(ctx, type, 48, 58, 17, '#94a28a');
  latin(ctx, 'INSTAPILOT / AI', 48, 88, 16, '#60705b');
  ctx.strokeStyle = PALETTE.line;
  ctx.beginPath(); ctx.moveTo(48, 135); ctx.lineTo(912, 135); ctx.stroke();
}

function footer(ctx, label, accent = true) {
  ctx.strokeStyle = PALETTE.line;
  ctx.beginPath(); ctx.moveTo(48, 458); ctx.lineTo(912, 458); ctx.stroke();
  ctx.fillStyle = accent ? PALETTE.lime : '#87957d';
  ctx.beginPath(); ctx.arc(898, 505, 4, 0, Math.PI * 2); ctx.fill();
  arabic(ctx, label, 880, 505, 24, accent ? '#c8ddae' : PALETTE.muted);
  latin(ctx, 'ILLUSTRATIVE UI', 48, 505, 15, '#68765e');
}

function chip(ctx, text, x, y, width, color = PALETTE.lime) {
  fillRound(ctx, x - width, y - 22, width, 44, 12, 'rgba(196,255,65,.055)', 'rgba(196,255,65,.14)');
  arabic(ctx, text, x - 17, y, 22, color, 400);
}

export function createMessageCanvas(kind = 'incoming') {
  const surface = canvas(960, 560);
  const ctx = surface.getContext('2d');
  if (!ctx) return surface;
  basePanel(ctx, 960, 560);

  if (kind === 'reply') {
    header(ctx, 'رد من معلومات متجرك', '02 / RESPONSE', 'sparkle');
    chip(ctx, 'من معلومات المتجر', 904, 185, 229);
    paragraph(ctx, 'نعم، متوفر. تحب تعرف التفاصيل؟', 898, 279, 780, 41, 70, 2, '#eef7e6', 600);
    ctx.strokeStyle = 'rgba(196,255,65,.28)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(61, 259); ctx.lineTo(61, 368); ctx.stroke();
    arabic(ctx, 'إجابة واضحة، من معلومات معتمدة.', 898, 407, 25, '#8d9b82');
    footer(ctx, 'عرض توضيحي للرد الذكي');
  } else if (kind === 'handoff') {
    header(ctx, 'تحتاج متابعتك', '03 / HANDOFF');
    chip(ctx, 'إلى صاحب المتجر', 904, 185, 219, '#d6ddc5');
    paragraph(ctx, 'تم تحويل المحادثة إلى صاحب المتجر', 898, 277, 784, 40, 70, 2, '#eff3e9', 600);
    arabic(ctx, 'عندما يحتاج الزبون إجابتك أنت.', 898, 407, 25, '#8d9b82');
    fillRound(ctx, 49, 274, 67, 67, 20, 'rgba(196,255,65,.035)', 'rgba(196,255,65,.11)');
    ctx.strokeStyle = '#b8c9a3';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(82, 296, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(82, 324, 16, Math.PI, 0); ctx.stroke();
    footer(ctx, 'عرض توضيحي لتحويل المحادثة', false);
  } else if (kind === 'knowledge') {
    header(ctx, 'معلومات المتجر', 'STORE / KNOWLEDGE', 'sparkle');
    const rows = [
      ['الأسعار', 'معلومات منتجاتك المعتمدة'],
      ['التوصيل', 'المناطق والشروط التي تحددها'],
      ['أوقات العمل', 'مواعيد المتجر وتفاصيله']
    ];
    rows.forEach(([title, description], i) => {
      const y = 200 + i * 91;
      fillRound(ctx, 859, y - 25, 43, 43, 12, 'rgba(196,255,65,.045)', 'rgba(196,255,65,.09)');
      ctx.strokeStyle = '#bbd19e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(870, y - 5); ctx.lineTo(877, y + 2); ctx.lineTo(890, y - 12); ctx.stroke();
      arabic(ctx, title, 827, y - 5, 29, '#eff3e7', 600);
      arabic(ctx, description, 827, y + 31, 22, '#86967a');
      if (i < 2) {
        ctx.strokeStyle = 'rgba(215,240,188,.065)';
        ctx.beginPath(); ctx.moveTo(69, y + 59); ctx.lineTo(827, y + 59); ctx.stroke();
      }
    });
    footer(ctx, 'عرض توضيحي لمعلومات المتجر');
  } else {
    header(ctx, 'رسالة جديدة', '01 / INCOMING');
    chip(ctx, 'محادثة توضيحية', 904, 185, 216);
    paragraph(ctx, 'هلا، المنتج متوفر؟', 898, 278, 780, 51, 72, 2, '#f1f5eb', 600);
    fillRound(ctx, 49, 346, 852, 71, 17, 'rgba(0,0,0,.14)', 'rgba(221,245,193,.055)');
    arabic(ctx, 'يبدأ كل شيء برسالة من زبونك.', 875, 383, 26, '#8f9f83');
    footer(ctx, 'عرض توضيحي لاستقبال الرسائل');
  }
  return surface;
}

export function createStudioCanvas() {
  const surface = canvas(1024, 512);
  const ctx = surface.getContext('2d');
  if (!ctx) return surface;
  ctx.fillStyle = '#030503';
  ctx.fillRect(0, 0, 1024, 512);
  const horizon = ctx.createLinearGradient(0, 0, 0, 512);
  horizon.addColorStop(0, '#111710');
  horizon.addColorStop(.36, '#070b06');
  horizon.addColorStop(.54, '#131c0e');
  horizon.addColorStop(.73, '#030503');
  horizon.addColorStop(1, '#020302');
  ctx.fillStyle = horizon; ctx.fillRect(0, 0, 1024, 512);

  // Reflection softboxes wrap around the object rather than becoming scenery.
  ctx.save();
  ctx.filter = 'blur(14px)';
  ctx.fillStyle = '#b6c0a4'; ctx.fillRect(160, 73, 35, 242);
  ctx.fillStyle = '#6a795b'; ctx.fillRect(732, 42, 82, 169);
  ctx.fillStyle = '#d4dfbe'; ctx.fillRect(428, 44, 153, 24);
  ctx.fillStyle = '#b4e558'; ctx.fillRect(31, 252, 180, 9);
  ctx.fillStyle = '#86b534'; ctx.fillRect(840, 267, 184, 10);
  ctx.fillStyle = '#3c5722'; ctx.fillRect(508, 350, 275, 15);
  ctx.restore();
  return surface;
}

export function createGlowCanvas() {
  const surface = canvas(256, 256);
  const ctx = surface.getContext('2d');
  if (!ctx) return surface;
  const glow = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
  glow.addColorStop(0, 'rgba(196,255,65,.65)');
  glow.addColorStop(.16, 'rgba(172,239,55,.3)');
  glow.addColorStop(.43, 'rgba(134,212,30,.095)');
  glow.addColorStop(1, 'rgba(134,212,30,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);
  return surface;
}

/* Scenes 02–04. Original studio imagery and fictional, explicitly labelled data.
   Image loading is opt-in so the approved first scene stays lightweight. */
const PRODUCT_IMAGE_URL = new URL('../assets/cinematic/product-studio-triptych.webp', import.meta.url).href;
let productStudioImage = null;
let productPreload = null;

const PRODUCTS = [
  { key: 'bag', title: 'حقيبة جلدية', category: 'تفاصيل تُختار بعناية', price: '45,000', crop: [0.015, .16, .97, .69] },
  { key: 'vase', title: 'مزهرية خزفية', category: 'قطعة هادئة لمساحتك', price: '32,000', crop: [.095, .15, .82, .68] },
  { key: 'perfume', title: 'عطر أمبر', category: 'تفاصيل من عالم العطور', price: '58,000', crop: [.09, .245, .83, .59] }
];

export function preloadProductImages() {
  if (productPreload) return productPreload;
  productPreload = new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => { productStudioImage = image; resolve(true); };
    image.onerror = () => resolve(false);
    image.src = PRODUCT_IMAGE_URL;
  });
  return productPreload;
}

function productIndex(kind) {
  if (typeof kind === 'number') return Math.max(0, Math.min(2, Math.floor(kind)));
  const aliases = { bag: 0, bags: 0, fashion: 0, vase: 1, home: 1, homegoods: 1, perfume: 2, fragrance: 2 };
  return aliases[kind] ?? 0;
}

function productShadow(ctx, x, y, width, height) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(width, height);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  shadow.addColorStop(0, 'rgba(0,0,0,.8)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function illustratedBag(ctx) {
  productShadow(ctx, 240, 470, 213, 35);
  ctx.lineCap = 'round';
  // Curved handle with a quiet warm edge and a dark leather core.
  ctx.beginPath(); ctx.moveTo(134, 218); ctx.bezierCurveTo(127, 15, 353, 15, 348, 218);
  ctx.strokeStyle = '#a6a185'; ctx.lineWidth = 23; ctx.stroke();
  ctx.strokeStyle = '#161c17'; ctx.lineWidth = 18; ctx.stroke();
  ctx.strokeStyle = '#6c7160'; ctx.lineWidth = 1; ctx.stroke();

  const body = ctx.createLinearGradient(73, 195, 416, 438);
  body.addColorStop(0, '#424b3e'); body.addColorStop(.26, '#252c25'); body.addColorStop(.65, '#141b16'); body.addColorStop(1, '#070e09');
  ctx.beginPath(); ctx.moveTo(90, 202); ctx.quadraticCurveTo(238, 178, 391, 203); ctx.lineTo(424, 443);
  ctx.quadraticCurveTo(240, 483, 57, 441); ctx.closePath(); ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = '#5d6952'; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 1100; i++) {
    const x = 57 + (i * 67 % 367), y = 193 + (i * 43 % 284);
    ctx.fillStyle = i % 3 ? 'rgba(206,218,185,.028)' : 'rgba(0,0,0,.16)';
    ctx.fillRect(x, y, 2, 1.2);
  }
  ctx.restore();
  const flap = ctx.createLinearGradient(0, 201, 0, 336);
  flap.addColorStop(0, '#323b30'); flap.addColorStop(1, '#111a13');
  ctx.beginPath(); ctx.moveTo(90, 202); ctx.lineTo(391, 203); ctx.lineTo(379, 308);
  ctx.quadraticCurveTo(239, 357, 101, 306); ctx.closePath(); ctx.fillStyle = flap; ctx.fill();
  ctx.strokeStyle = '#59684b'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.setLineDash([3, 5]); ctx.strokeStyle = '#76816b'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(105, 217); ctx.lineTo(377, 217); ctx.lineTo(367, 297); ctx.quadraticCurveTo(240, 341, 114, 298); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  [[135, 215], [347, 215]].forEach(([x, y]) => {
    ctx.beginPath(); ctx.ellipse(x, y, 12, 19, 0, 0, Math.PI * 2); ctx.strokeStyle = '#a99d70'; ctx.lineWidth = 5; ctx.stroke();
    fillRound(ctx, x - 7, y + 13, 14, 24, 4, '#242b21', '#72795d');
  });
  fillRound(ctx, 218, 310, 45, 18, 6, '#8d8c64', '#bbb18a');
  ctx.strokeStyle = '#b5da71'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(392, 207); ctx.lineTo(420, 438); ctx.stroke();
}

function illustratedVase(ctx) {
  productShadow(ctx, 239, 480, 173, 31);
  const body = ctx.createLinearGradient(101, 70, 385, 400);
  body.addColorStop(0, '#777b5c'); body.addColorStop(.18, '#4b5141'); body.addColorStop(.5, '#212b22'); body.addColorStop(.8, '#111a12'); body.addColorStop(1, '#4a6337');
  ctx.beginPath(); ctx.moveTo(164, 76); ctx.bezierCurveTo(166, 171, 101, 208, 106, 318);
  ctx.bezierCurveTo(107, 416, 169, 478, 246, 478); ctx.bezierCurveTo(325, 478, 379, 407, 377, 321);
  ctx.bezierCurveTo(375, 219, 292, 170, 311, 48); ctx.quadraticCurveTo(239, 83, 164, 76); ctx.closePath();
  ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = '#616b4e'; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 19; i++) {
    const x = 113 + i * 14;
    ctx.beginPath(); ctx.moveTo(178 + i * 6, 68); ctx.bezierCurveTo(x + 60, 195, x - 67, 270, x + 12, 479);
    ctx.strokeStyle = i % 2 ? 'rgba(213,223,179,.07)' : 'rgba(0,0,0,.2)'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(238, 67, 78, 16, -.18, 0, Math.PI * 2); ctx.fillStyle = '#11180f'; ctx.fill(); ctx.strokeStyle = '#aaa88a'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(311, 55); ctx.bezierCurveTo(291, 181, 374, 226, 375, 321); ctx.bezierCurveTo(376, 401, 323, 470, 264, 477);
  ctx.strokeStyle = 'rgba(196,255,65,.4)'; ctx.lineWidth = 1.6; ctx.stroke();
}

function illustratedPerfume(ctx) {
  productShadow(ctx, 240, 475, 194, 32);
  const glass = ctx.createLinearGradient(100, 200, 380, 423);
  glass.addColorStop(0, '#7d622c'); glass.addColorStop(.16, '#b78c3b'); glass.addColorStop(.28, '#6b4518'); glass.addColorStop(.7, '#583512'); glass.addColorStop(.86, '#b18c40'); glass.addColorStop(1, '#312816');
  fillRound(ctx, 98, 202, 285, 263, 34, glass, '#c2ad67');
  const liquid = ctx.createLinearGradient(0, 238, 0, 448);
  liquid.addColorStop(0, 'rgba(187,119,23,.55)'); liquid.addColorStop(.6, 'rgba(121,70,15,.7)'); liquid.addColorStop(1, 'rgba(207,144,36,.6)');
  fillRound(ctx, 118, 246, 245, 195, 22, liquid, 'rgba(225,180,83,.25)');
  fillRound(ctx, 111, 213, 259, 240, 25, 'rgba(0,0,0,0)', 'rgba(244,220,148,.43)');
  fillRound(ctx, 200, 166, 80, 42, 8, '#b28a3d', '#cbb778');
  const cap = ctx.createLinearGradient(158, 90, 320, 177);
  cap.addColorStop(0, '#31362d'); cap.addColorStop(.55, '#0a100c'); cap.addColorStop(1, '#1d2919');
  fillRound(ctx, 156, 77, 168, 99, 9, cap, '#717353');
  ctx.strokeStyle = 'rgba(241,224,163,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(112, 241); ctx.lineTo(112, 421); ctx.quadraticCurveTo(114, 447, 144, 449); ctx.stroke();
  ctx.strokeStyle = 'rgba(196,255,65,.58)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(374, 231); ctx.lineTo(374, 425); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,244,200,.18)'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(139, 234); ctx.lineTo(139, 420); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,241,191,.45)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(170, 89); ctx.lineTo(312, 89); ctx.stroke();
}

function productImage(ctx, index, x, y, width, height) {
  const item = PRODUCTS[index];
  ctx.save(); round(ctx, x, y, width, height, 22); ctx.clip();
  const background = ctx.createRadialGradient(x + width * .5, y + height * .4, 0, x + width * .5, y + height * .55, height * .75);
  background.addColorStop(0, '#272d1c'); background.addColorStop(.6, '#10150f'); background.addColorStop(1, '#080d09');
  ctx.fillStyle = background; ctx.fillRect(x, y, width, height);
  if (productStudioImage?.complete && productStudioImage.naturalWidth) {
    const tile = productStudioImage.naturalWidth / 3;
    const [cx, cy, cw, ch] = item.crop;
    const sx = index * tile + tile * cx, sy = productStudioImage.naturalHeight * cy;
    const sw = tile * cw, sh = productStudioImage.naturalHeight * ch;
    const scale = Math.min(width / sw, height / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(productStudioImage, sx, sy, sw, sh, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
  } else {
    const scale = Math.min(width / 480, height / 540);
    ctx.translate(x + (width - 480 * scale) / 2, y + (height - 540 * scale) / 2);
    ctx.scale(scale, scale);
    [illustratedBag, illustratedVase, illustratedPerfume][index](ctx);
  }
  ctx.restore();
}

export function createProductCanvas(kind = 'bag') {
  const surface = canvas(720, 900), ctx = surface.getContext('2d');
  if (!ctx) return surface;
  const index = productIndex(kind), item = PRODUCTS[index];
  basePanel(ctx, 720, 900);
  latin(ctx, `STORE / 0${index + 1}`, 40, 51, 17, '#86937c');
  arabic(ctx, 'منتج توضيحي', 681, 51, 24, '#c6ddaa');
  productImage(ctx, index, 28, 91, 664, 558);
  ctx.strokeStyle = 'rgba(209,239,172,.12)'; ctx.beginPath(); ctx.moveTo(40, 674); ctx.lineTo(680, 674); ctx.stroke();
  arabic(ctx, item.title, 678, 719, 39, '#f2f4eb', 600);
  arabic(ctx, item.category, 678, 766, 23, '#8c9a80');
  arabic(ctx, `سعر تجريبي ${item.price} د.ع`, 678, 823, 31, '#c4ff41', 600);
  arabic(ctx, 'صور وأسعار للعرض فقط', 678, 870, 21, '#75826c');
  latin(ctx, 'DEMO CATALOG', 40, 870, 14, '#65735d');
  return surface;
}

export function createProcessingCanvas(stage = 'analysis') {
  const surface = canvas(1200, 300), ctx = surface.getContext('2d');
  if (!ctx) return surface;
  basePanel(ctx, 1200, 300);
  const stages = [
    ['استقبال الرسالة', 'سؤال من زبونك', 1000],
    ['تحليل المعلومات', 'من معلومات متجرك', 600],
    ['إنشاء الرد', 'بحسب إعدادات المساعد', 200]
  ];
  const names = { incoming: 0, receive: 0, reception: 0, analysis: 1, analyse: 1, reply: 2, response: 2 };
  const selected = typeof stage === 'number' ? Math.max(0, Math.min(2, Math.floor(stage))) : names[stage] ?? 1;
  latin(ctx, 'CONVERSATION / FLOW', 42, 33, 16, '#7c8a71');
  arabic(ctx, 'مسار توضيحي للمحادثة', 1158, 33, 23, '#a9b89c');
  [[840, 760], [440, 360]].forEach(([from, to], i) => {
    ctx.strokeStyle = selected > i ? '#a1c753' : '#38432f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(from, 149); ctx.lineTo(to, 149); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(to + 9, 142); ctx.lineTo(to, 149); ctx.lineTo(to + 9, 156); ctx.stroke();
  });
  stages.forEach(([label, detail, x], i) => {
    const isActive = i === selected, completed = i < selected;
    fillRound(ctx, x - 158, 71, 316, 148, 22, isActive ? '#1b2812' : '#10170f', isActive ? 'rgba(196,255,65,.4)' : 'rgba(221,241,193,.12)');
    ctx.fillStyle = isActive || completed ? '#c4ff41' : '#64745a';
    ctx.beginPath(); ctx.arc(x + 120, 98, 3.5, 0, Math.PI * 2); ctx.fill();
    latin(ctx, `0${i + 1}`, x - 131, 99, 15, isActive ? '#c4ff41' : '#68775f');
    arabic(ctx, label, x + 131, 141, 29, isActive ? '#eef8df' : '#c6d0bd', 600);
    arabic(ctx, detail, x + 131, 185, 22, '#849576');
  });
  arabic(ctx, 'يعتمد الرد على معلومات المتجر وإعداداته — عرض توضيحي', 1158, 264, 22, '#7f8f74');
  return surface;
}

export function createBookingCanvas() {
  const surface = canvas(960, 620), ctx = surface.getContext('2d');
  if (!ctx) return surface;
  basePanel(ctx, 960, 620);
  fillRound(ctx, 838, 37, 74, 74, 22, 'rgba(196,255,65,.065)', 'rgba(196,255,65,.14)');
  ctx.strokeStyle = '#c4ff41'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(859, 74); ctx.lineTo(871, 85); ctx.lineTo(892, 60); ctx.stroke();
  arabic(ctx, 'حجز توضيحي', 808, 73, 35, '#eff5e8', 600);
  latin(ctx, 'BOOKING / DEMO', 48, 55, 16, '#8d9b81');
  latin(ctx, 'INSTAPILOT / AI', 48, 86, 15, '#67765d');
  ctx.strokeStyle = PALETTE.line; ctx.beginPath(); ctx.moveTo(48, 134); ctx.lineTo(912, 134); ctx.stroke();
  arabic(ctx, 'من المحادثة إلى الحجز.', 910, 179, 41, '#f1f6e8', 600);
  productImage(ctx, 0, 48, 228, 188, 152);
  arabic(ctx, 'حقيبة جلدية', 910, 251, 32, '#e6eddd', 600);
  arabic(ctx, 'الكمية: 1 · منتج توضيحي', 910, 298, 24, '#8c9c7f');
  arabic(ctx, 'سعر تجريبي 45,000 د.ع', 910, 346, 27, '#bfdc8d');
  chip(ctx, 'حالة توضيحية: مؤكّد', 910, 411, 287);
  ctx.strokeStyle = PALETTE.line; ctx.beginPath(); ctx.moveTo(48, 452); ctx.lineTo(912, 452); ctx.stroke();
  arabic(ctx, 'رقم الزبون', 910, 487, 23, '#8b9b7d');
  latin(ctx, '07•• ••• ••••', 48, 487, 27, '#c3cdb7');
  arabic(ctx, 'العنوان', 910, 531, 23, '#8b9b7d');
  arabic(ctx, 'عنوان توضيحي — بغداد', 574, 531, 25, '#c3cdb7');
  ctx.strokeStyle = PALETTE.line; ctx.beginPath(); ctx.moveTo(48, 564); ctx.lineTo(912, 564); ctx.stroke();
  arabic(ctx, 'بيانات حجز توضيحية — دون معلومات شخصية', 910, 592, 21, '#7d8e70');
  latin(ctx, 'DEMO ONLY', 48, 592, 14, '#617054');
  return surface;
}
