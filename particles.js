(function () {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, time = 0;
  let motes = [], caustics = [], rays = [];

  /* ── 캔버스 크기 맞춤 ── */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  /* ── 부유 입자 ── */
  class Mote {
    constructor() { this.reset(true); }
    reset(init) {
      this.x  = Math.random() * W;
      this.y  = init ? Math.random() * H : H + 6;
      this.r  = Math.random() * 1.1 + 0.2;
      this.vy = -(Math.random() * 0.18 + 0.03);
      this.vx = (Math.random() - 0.5) * 0.07;
      this.wb = Math.random() * Math.PI * 2;
      this.ws = Math.random() * 0.011 + 0.003;
      this.op = 0;
      this.maxOp = Math.random() * 0.38 + 0.05;
      this.life = 0;
      this.maxL = Math.random() * 800 + 500;
    }
    tick() {
      this.wb += this.ws;
      this.x  += this.vx + Math.sin(this.wb) * 0.13;
      this.y  += this.vy;
      this.life++;
      const p = this.life / this.maxL;
      if      (p < 0.12) this.op = (p / 0.12) * this.maxOp;
      else if (p > 0.78) this.op = ((1 - p) / 0.22) * this.maxOp;
      else               this.op = this.maxOp;
      if (this.life > this.maxL || this.y < -8) this.reset(false);
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.op;
      ctx.fillStyle = 'rgba(160,220,255,1)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── 코스틱 반점 ── */
  class Caustic {
    constructor() { this.reset(true); }
    reset(init) {
      this.x    = Math.random() * W;
      this.y    = init ? Math.random() * H * 0.7 : -30;
      this.r    = Math.random() * 55 + 18;
      this.vx   = (Math.random() - 0.5) * 0.28;
      this.vy   = Math.random() * 0.35 + 0.08;
      this.op   = 0;
      this.maxOp= Math.random() * 0.065 + 0.018;
      this.life = 0;
      this.maxL = Math.random() * 550 + 280;
    }
    tick() {
      this.x += this.vx;
      this.y += this.vy;
      this.r  += 0.035;
      this.life++;
      const p = this.life / this.maxL;
      if      (p < 0.18) this.op = (p / 0.18) * this.maxOp;
      else if (p > 0.62) this.op = ((1 - p) / 0.38) * this.maxOp;
      else               this.op = this.maxOp;
      if (this.life > this.maxL || this.y > H + 30) this.reset(false);
    }
    draw() {
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
      g.addColorStop(0,   `rgba(70,175,255,${this.op * 1.9})`);
      g.addColorStop(0.45,`rgba(30,110,220,${this.op})`);
      g.addColorStop(1,   'rgba(0,30,90,0)');
      ctx.save();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── 빛 기둥 설정 ── */
  function makeRays() {
    rays = [
      { bx: 0.15, spread: 0.20, ph: 0.0,  sp: 0.00026, br: 0.09 },
      { bx: 0.38, spread: 0.28, ph: 1.3,  sp: 0.00021, br: 0.14 },
      { bx: 0.60, spread: 0.17, ph: 2.6,  sp: 0.00033, br: 0.08 },
      { bx: 0.80, spread: 0.22, ph: 0.7,  sp: 0.00019, br: 0.11 },
    ];
  }

  /* ── 베이스 심해 배경 ── */
  function drawBg() {
    const t  = time * 0.00032;
    const cx = W * (0.5 + Math.sin(t) * 0.055);
    const cy = H * (0.25 + Math.cos(t * 0.55) * 0.04);

    const base = ctx.createRadialGradient(cx, cy, 0, W * 0.5, H * 0.5, Math.max(W, H) * 1.15);
    base.addColorStop(0,    'rgba(2,22,50,1)');
    base.addColorStop(0.28, 'rgba(1,13,30,1)');
    base.addColorStop(0.62, 'rgba(0,7,18,1)');
    base.addColorStop(1,    'rgba(0,3,10,1)');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    /* 수면 방향 청색 광 */
    const surf = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    surf.addColorStop(0,   'rgba(8,55,130,0.20)');
    surf.addColorStop(0.38,'rgba(4,28,75,0.07)');
    surf.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = surf;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── 빛 기둥 렌더 ── */
  function drawRays() {
    for (const ray of rays) {
      const t    = time * ray.sp + ray.ph;
      const sway = Math.sin(t) * 0.065;
      const cx   = W * (ray.bx + sway);
      const hTop = W * 0.011;
      const hBot = W * ray.spread;

      /* 넓은 기둥 */
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.88);
      g.addColorStop(0,    `rgba(55,155,255,${ray.br})`);
      g.addColorStop(0.38, `rgba(25,95,200,${ray.br * 0.52})`);
      g.addColorStop(0.72, `rgba(8,45,135,${ray.br * 0.18})`);
      g.addColorStop(1,    'rgba(0,15,55,0)');
      ctx.save();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - hTop, 0);
      ctx.lineTo(cx + hTop, 0);
      ctx.lineTo(cx + hBot, H);
      ctx.lineTo(cx - hBot, H);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      /* 중심 코어 */
      const cBr = ray.br * 0.52;
      const cg  = ctx.createLinearGradient(0, 0, 0, H * 0.58);
      cg.addColorStop(0,   `rgba(130,205,255,${cBr})`);
      cg.addColorStop(0.42,`rgba(70,155,255,${cBr * 0.38})`);
      cg.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.save();
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(cx - hTop * 0.28, 0);
      ctx.lineTo(cx + hTop * 0.28, 0);
      ctx.lineTo(cx + hBot * 0.16, H * 0.58);
      ctx.lineTo(cx - hBot * 0.16, H * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── 수면 물결 ── */
  function drawSurface() {
    const t = time * 0.00075;
    ctx.save();
    ctx.globalAlpha = 0.11;
    for (let i = 0; i < 7; i++) {
      const y   = 2.5 + i * 2.8 + Math.sin(t + i * 0.85) * 1.4;
      const g   = ctx.createLinearGradient(0, 0, W, 0);
      const mid = 0.28 + Math.sin(t * 0.65 + i) * 0.14;
      g.addColorStop(0,   'rgba(90,190,255,0)');
      g.addColorStop(mid, 'rgba(155,225,255,0.85)');
      g.addColorStop(1,   'rgba(90,190,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth   = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 5) {
        ctx.lineTo(x, y + Math.sin(x * 0.017 + t * 1.9 + i) * 1.1);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── 비네트 ── */
  function drawVignette() {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.04, W / 2, H / 2, Math.max(W, H) * 0.9);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── 초기화 ── */
  function init() {
    resize();
    makeRays();
    motes    = Array.from({ length: 110 }, () => new Mote());
    caustics = Array.from({ length: 20  }, () => new Caustic());
  }

  /* ── 루프 ── */
  function loop() {
    requestAnimationFrame(loop);
    time++;
    drawBg();
    drawRays();
    drawSurface();
    motes.forEach(m => { m.tick(); m.draw(); });
    caustics.forEach(c => { c.tick(); c.draw(); });
    drawVignette();
  }

  window.addEventListener('resize', resize);
  init();
  loop();
})();
