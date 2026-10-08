/*
 * CloudFX - visual effects for the loot items viewers trigger from chat.
 *
 * Two full-screen canvases share one animation loop:
 *  - a low-res "pixel" canvas scaled up with nearest-neighbour filtering, used for
 *    SNES-style sprites (potion flask, stones, umbrellas, shovel, rain...)
 *  - a full-res canvas for lights, bloom, smoke, sparks and lightning.
 * Mixing both gives the HD-2D look (pixel sprites lit by modern lighting) for some
 * items, while others (bomb, shield, mud, dice) stay fully realistic.
 *
 * Public API (window.CloudFX):
 *   potion(user) shield(user) umbrella(user) bomb(user, {onExplode})
 *   sunStone(user, {onBurst}) rainStone(user, {onStrike}) shovel(user, {onFirstSplat})
 *   dice(d1, d2, user) lightning(opts)
 */
(function () {
    'use strict';

    const PX = 5; // screen pixels per art pixel on the pixel canvas

    let hiCv, hiCtx, pxCv, pxCtx;
    let W = 0, H = 0, PW = 0, PH = 0;
    const actors = [];
    let rafId = null;
    let lastTs = 0;

    // ---------- math helpers ----------
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const easeOutCubic = k => 1 - Math.pow(1 - k, 3);
    const easeInCubic = k => k * k * k;
    const easeOutBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
    const easeInOutSine = k => -(Math.cos(Math.PI * k) - 1) / 2;
    // 0 -> 1 while t goes from a to b
    const phase = (t, a, b) => clamp((t - a) / (b - a));
    // fades in over [a, b], holds, fades out over [c, d]
    const envelope = (t, a, b, c, d) => Math.min(phase(t, a, b), 1 - phase(t, c, d));
    // how many particles to emit this frame for a given rate per second
    const count = (rate, dt) => { const n = rate * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w));
        c.height = Math.max(1, Math.ceil(h));
        return c;
    }

    // ---------- engine ----------
    function setup() {
        if (hiCv) return;
        pxCv = makeCanvas(1, 1);
        pxCv.className = 'fx-canvas fx-canvas--pixel';
        hiCv = makeCanvas(1, 1);
        hiCv.className = 'fx-canvas fx-canvas--hi';
        document.body.appendChild(pxCv);
        document.body.appendChild(hiCv);
        hiCtx = hiCv.getContext('2d');
        pxCtx = pxCv.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        W = hiCv.width = window.innerWidth;
        H = hiCv.height = window.innerHeight;
        PW = pxCv.width = Math.ceil(W / PX);
        PH = pxCv.height = Math.ceil(H / PX);
        pxCv.style.width = `${PW * PX}px`;
        pxCv.style.height = `${PH * PX}px`;
        pxCtx.imageSmoothingEnabled = false;
    }

    function add(actor) {
        setup();
        actor.t = 0;
        actors.push(actor);
        if (!rafId) {
            lastTs = performance.now();
            rafId = requestAnimationFrame(frame);
        }
        return actor;
    }

    function frame(now) {
        const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
        lastTs = now;
        hiCtx.setTransform(1, 0, 0, 1, 0, 0);
        hiCtx.clearRect(0, 0, W, H);
        pxCtx.setTransform(1, 0, 0, 1, 0, 0);
        pxCtx.clearRect(0, 0, PW, PH);
        pxCtx.imageSmoothingEnabled = false;

        for (const a of actors) {
            a.t += dt;
            let alive;
            try {
                alive = a.update(dt, a.t) !== false;
                if (alive && a.draw) {
                    hiCtx.save();
                    pxCtx.save();
                    a.draw(hiCtx, pxCtx, a.t);
                    hiCtx.restore();
                    pxCtx.restore();
                }
            } catch (err) {
                console.error('[CloudFX] effect error:', err);
                alive = false;
            }
            if (!alive) {
                a.dead = true;
                if (a.onEnd) a.onEnd();
            }
        }
        for (let i = actors.length - 1; i >= 0; i--) {
            if (actors[i].dead) actors.splice(i, 1);
        }

        if (actors.length) {
            rafId = requestAnimationFrame(frame);
        } else {
            rafId = null;
            hiCtx.clearRect(0, 0, W, H);
            pxCtx.clearRect(0, 0, PW, PH);
        }
    }

    // ---------- particles ----------
    class Particles {
        constructor() { this.list = []; }
        emit(o) {
            this.list.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, size: 4, grow: 0, rot: 0, vr: 0, age: 0, life: 1, alpha: 1 }, o));
        }
        update(dt) {
            const L = this.list;
            for (let i = L.length - 1; i >= 0; i--) {
                const p = L[i];
                p.age += dt;
                if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
                if (p.age < 0) continue;
                if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; }
                p.vy += p.g * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.rot += p.vr * dt;
                p.size = Math.max(0, p.size + p.grow * dt);
                if (p.tick) p.tick(p, dt);
            }
        }
        get length() { return this.list.length; }
    }
    const lifeOf = p => clamp(p.age / p.life);

    // ---------- cached light sprites ----------
    const glowCache = {};
    function glowSprite(rgb, core) {
        const key = rgb + (core ? '+' : '');
        if (glowCache[key]) return glowCache[key];
        const c = makeCanvas(128, 128), g = c.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        if (core) {
            gr.addColorStop(0, 'rgba(255,255,255,1)');
            gr.addColorStop(0.12, `rgba(${rgb},0.9)`);
        } else {
            gr.addColorStop(0, `rgba(${rgb},1)`);
        }
        gr.addColorStop(0.35, `rgba(${rgb},0.35)`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
        return (glowCache[key] = c);
    }

    // a defocused light disc, used for the foreground "depth of field" orbs
    const bokehCache = {};
    function bokehSprite(rgb) {
        if (bokehCache[rgb]) return bokehCache[rgb];
        const c = makeCanvas(128, 128), g = c.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, `rgba(${rgb},0.35)`);
        gr.addColorStop(0.75, `rgba(${rgb},0.5)`);
        gr.addColorStop(0.86, `rgba(${rgb},0.3)`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
        return (bokehCache[rgb] = c);
    }

    const smokeCache = {};
    function smokeSprite(rgb, variant) {
        const key = `${rgb}/${variant}`;
        if (smokeCache[key]) return smokeCache[key];
        const c = makeCanvas(128, 128), g = c.getContext('2d');
        for (let k = 0; k < 7; k++) {
            const x = rand(42, 86), y = rand(42, 86), r = rand(24, 40);
            const gr = g.createRadialGradient(x, y, 0, x, y, r);
            gr.addColorStop(0, 'rgba(255,255,255,0.4)');
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr;
            g.beginPath();
            g.arc(x, y, r, 0, TAU);
            g.fill();
        }
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = `rgb(${rgb})`;
        g.fillRect(0, 0, 128, 128);
        return (smokeCache[key] = c);
    }

    function drawGlow(ctx, rgb, x, y, r, alpha = 1, core = false) {
        if (alpha <= 0.002 || r <= 0) return;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(glowSprite(rgb, core), x - r, y - r, r * 2, r * 2);
    }

    function drawGlowParticles(ctx, ps) {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of ps.list) {
            if (p.age < 0) continue;
            const k = lifeOf(p);
            const fadeIn = p.fadeIn ? Math.min(1, k / p.fadeIn) : 1;
            drawGlow(ctx, p.color, p.x, p.y, p.size, p.alpha * fadeIn * (1 - k), p.core);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function drawBokeh(ctx, ps) {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of ps.list) {
            const k = lifeOf(p);
            ctx.globalAlpha = p.alpha * Math.min(1, k / 0.25) * (1 - k);
            ctx.drawImage(bokehSprite(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function drawSparks(ctx, ps, width = 2) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const p of ps.list) {
            if (p.age < 0) continue;
            const k = lifeOf(p);
            const streak = p.streak || 0.03;
            ctx.strokeStyle = `rgba(${p.color},${(1 - k) * p.alpha})`;
            ctx.lineWidth = p.w || width;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * streak, p.y - p.vy * streak);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    // pixel particles: hard pixels that blink out instead of fading (retro style)
    function drawPixelParticles(ctx, ps) {
        for (const p of ps.list) {
            if (p.age < 0) continue;
            const k = lifeOf(p);
            if (k > 0.75 && Math.floor(p.age * 20) % 2) continue;
            if (p.sprite) {
                ctx.drawImage(p.sprite, Math.round(p.x / PX - p.sprite.width / 2), Math.round(p.y / PX - p.sprite.height / 2));
            } else {
                const s = p.px || 1;
                ctx.fillStyle = p.color;
                ctx.fillRect(Math.round(p.x / PX - s / 2), Math.round(p.y / PX - s / 2), s, s);
            }
        }
    }

    function drawRays(ctx, x, y, n, rot, len, width, rgb, alpha) {
        if (alpha <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(x, y);
        const gr = ctx.createLinearGradient(0, 0, len, 0);
        gr.addColorStop(0, `rgba(${rgb},${alpha})`);
        gr.addColorStop(0.35, `rgba(${rgb},${alpha * 0.35})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gr;
        for (let i = 0; i < n; i++) {
            ctx.save();
            ctx.rotate(rot + i * TAU / n);
            const w = width * (0.55 + 0.45 * Math.sin(i * 1.7 + 0.5));
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(len, -w / 2);
            ctx.lineTo(len, w / 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    // ---------- pixel sprites ----------
    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    // Draw with normal canvas shapes on a tiny canvas, then snap the alpha to
    // on/off and add a 1px dark outline: instant SNES-style sprite.
    function pixelSprite(w, h, draw, outline = '#140c1c') {
        const c = makeCanvas(w, h);
        const g = c.getContext('2d');
        draw(g, w, h);
        const img = g.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
        if (outline) {
            const [r, gg, b] = hexToRgb(outline);
            const solid = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] ? 1 : 0;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    if (solid[i]) continue;
                    if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
                        d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
                    }
                }
            }
        }
        g.putImageData(img, 0, 0);
        return c;
    }

    // draws a sprite centred on screen coords (x, y); sx squashes it horizontally (spin effect)
    function blitPx(ctx, sprite, x, y, scale = 1, sx = 1) {
        const w = Math.round(sprite.width * scale * Math.abs(sx));
        const h = sprite.height * scale;
        if (w < 1) return;
        ctx.drawImage(sprite, Math.round(x / PX - w / 2), Math.round(y / PX - h / 2), w, h);
    }

    // draws a sprite rotated around a pivot (ox, oy in sprite pixels) placed at screen coords (x, y)
    function blitPxRot(ctx, sprite, x, y, ox, oy, angle, scale = 1) {
        ctx.save();
        ctx.translate(Math.round(x / PX), Math.round(y / PX));
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.drawImage(sprite, -ox, -oy);
        ctx.restore();
    }

    function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

    const spriteCache = {};
    function cached(key, make) { return spriteCache[key] || (spriteCache[key] = make()); }

    const sprites = {
        potion: () => cached('potion', () => pixelSprite(32, 44, g => {
            g.fillStyle = '#cdeeff';
            circle(g, 16, 30, 12.5);
            g.fillRect(11, 9, 10, 12);
            g.fillStyle = '#e8f8ff';
            g.fillRect(9, 8, 14, 3);
            g.save();
            g.beginPath();
            g.arc(16, 30, 11, 0, TAU);
            g.clip();
            const lg = g.createLinearGradient(0, 23, 0, 42);
            lg.addColorStop(0, '#8dffbf');
            lg.addColorStop(0.15, '#34e07f');
            lg.addColorStop(1, '#0c7a3c');
            g.fillStyle = lg;
            g.fillRect(0, 24, 32, 20);
            g.fillStyle = '#c4ffdd';
            g.fillRect(0, 24, 32, 1);
            g.fillStyle = 'rgba(0,40,30,0.28)';
            g.fillRect(20, 18, 12, 26);
            g.restore();
            g.fillStyle = '#ffffff';
            g.fillRect(8, 25, 2, 6);
            g.fillRect(9, 22, 2, 2);
            g.fillRect(13, 12, 1, 7);
            g.fillStyle = '#e3ffef';
            g.fillRect(18, 34, 2, 2);
            g.fillRect(14, 38, 1, 1);
            g.fillRect(21, 29, 1, 1);
        }, '#0b2233')),

        cork: () => cached('cork', () => pixelSprite(12, 9, g => {
            g.fillStyle = '#9b6332';
            g.fillRect(2, 1, 8, 7);
            g.fillStyle = '#c98a4b';
            g.fillRect(3, 1, 2, 7);
            g.fillStyle = '#6e421e';
            g.fillRect(8, 1, 2, 7);
        }, '#2a1608')),

        healCross: () => cached('cross', () => pixelSprite(7, 7, g => {
            g.fillStyle = '#8dffb5';
            g.fillRect(2, 1, 3, 5);
            g.fillRect(1, 2, 5, 3);
            g.fillStyle = '#ffffff';
            g.fillRect(3, 2, 1, 1);
        }, '#0b5a2e')),

        sparkle: (color = '#fff6c8') => cached('sparkle' + color, () => pixelSprite(9, 9, g => {
            g.fillStyle = color;
            g.fillRect(4, 0, 1, 9);
            g.fillRect(0, 4, 9, 1);
            g.fillRect(3, 3, 3, 3);
            g.fillStyle = '#ffffff';
            g.fillRect(4, 4, 1, 1);
        }, null)),

        bubble: (r) => cached('bubble' + r, () => {
            const s = r * 2 + 3, c = makeCanvas(s, s), g = c.getContext('2d');
            const img = g.createImageData(s, s), cx = (s - 1) / 2;
            for (let y = 0; y < s; y++) {
                for (let x = 0; x < s; x++) {
                    if (Math.abs(Math.hypot(x - cx, y - cx) - r) < 0.55) {
                        const i = (y * s + x) * 4;
                        img.data[i] = 190; img.data[i + 1] = 255; img.data[i + 2] = 220; img.data[i + 3] = 255;
                    }
                }
            }
            if (r > 1) {
                const i = (Math.round(cx - r * 0.45) * s + Math.round(cx - r * 0.45)) * 4;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = 255;
            }
            g.putImageData(img, 0, 0);
            return c;
        }),

        sunStone: () => cached('sunStone', () => pixelSprite(30, 36, g => {
            const tri = (pts, col) => {
                g.fillStyle = col;
                g.beginPath();
                g.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
                g.closePath();
                g.fill();
            };
            const top = [15, 2], L = [3, 13], R = [27, 13], bottom = [15, 34], cL = [10, 13], cR = [20, 13];
            tri([top, L, cL], '#fff3b0');
            tri([top, cL, cR], '#ffe066');
            tri([top, cR, R], '#ffc233');
            tri([L, cL, bottom], '#ffb020');
            tri([cL, cR, bottom], '#ff9a1a');
            tri([cR, R, bottom], '#d96a00');
            g.fillStyle = '#ffffff';
            g.fillRect(11, 6, 2, 2);
            g.fillRect(9, 10, 1, 1);
            g.fillStyle = '#fff6d0';
            g.fillRect(14, 17, 3, 3);
            g.fillRect(15, 15, 1, 7);
            g.fillRect(12, 18, 7, 1);
        }, '#4a2000')),

        rainStone: () => cached('rainStone', () => pixelSprite(28, 38, g => {
            const gr = g.createRadialGradient(10, 18, 1, 14, 24, 16);
            gr.addColorStop(0, '#c9eeff');
            gr.addColorStop(0.35, '#5fb0ff');
            gr.addColorStop(0.75, '#2258d8');
            gr.addColorStop(1, '#0f2f8a');
            g.fillStyle = gr;
            circle(g, 14, 25, 11);
            g.beginPath();
            g.moveTo(14, 2);
            g.lineTo(4, 22);
            g.lineTo(24, 22);
            g.closePath();
            g.fill();
            g.fillStyle = '#ffffff';
            g.fillRect(8, 20, 2, 5);
            g.fillRect(9, 17, 1, 2);
            g.fillRect(12, 8, 1, 4);
            g.fillStyle = '#e2f7ff';
            g.fillRect(13, 26, 3, 3);
        }, '#071848')),

        shovel: () => cached('shovel', () => pixelSprite(22, 80, g => {
            // D-grip
            g.strokeStyle = '#5b3417';
            g.lineWidth = 2;
            g.strokeRect(5, 70, 12, 8);
            g.fillStyle = '#c58b4d';
            g.fillRect(6, 73, 10, 3);
            // shaft
            g.fillStyle = '#a8743e';
            g.fillRect(9, 21, 4, 50);
            g.fillStyle = '#d6a066';
            g.fillRect(9, 21, 1, 50);
            g.fillStyle = '#74491f';
            g.fillRect(12, 21, 1, 50);
            // collar
            g.fillStyle = '#8b949e';
            g.fillRect(8, 18, 6, 6);
            g.fillStyle = '#c9d1d9';
            g.fillRect(8, 18, 2, 6);
            // blade
            const bg = g.createLinearGradient(3, 0, 19, 0);
            bg.addColorStop(0, '#eef3f7');
            bg.addColorStop(0.5, '#b3bdc7');
            bg.addColorStop(1, '#6f7b88');
            g.fillStyle = bg;
            g.beginPath();
            g.moveTo(3, 19);
            g.lineTo(19, 19);
            g.lineTo(19, 8);
            g.lineTo(11, 1);
            g.lineTo(3, 8);
            g.closePath();
            g.fill();
            g.fillStyle = '#ffffff';
            g.fillRect(5, 9, 1, 8);
        }, '#1e1410')),

        shovelMud: () => cached('shovelMud', () => pixelSprite(22, 80, g => {
            g.fillStyle = '#5a3a22';
            circle(g, 11, 10, 7);
            circle(g, 7, 12, 4);
            circle(g, 15, 12, 4);
            g.fillStyle = '#8a5c38';
            circle(g, 9, 7, 3);
            circle(g, 14, 8, 2);
            g.fillStyle = '#b0805a';
            g.fillRect(8, 5, 2, 1);
        }, '#20120a')),

        umbrella: (o, cA, cB) => cached(`umb${o}${cA}${cB}`, () => pixelSprite(72, 66, g => {
            const cx = 36, base = 22, hw = lerp(5, 32, o), ch = lerp(18, 15, o);
            g.fillStyle = '#4a4a55';
            g.fillRect(35, base - ch - 4, 2, 5);
            g.fillStyle = '#7b7b88';
            g.fillRect(35, base, 2, 30);
            g.strokeStyle = '#8a4b22';
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(36, 50);
            g.lineTo(36, 55);
            g.arc(31, 55, 5, 0, Math.PI);
            g.stroke();
            g.save();
            g.beginPath();
            g.ellipse(cx, base, hw, ch, 0, Math.PI, TAU);
            g.closePath();
            g.clip();
            const n = 6, pw = (2 * hw) / n;
            for (let k = 0; k < n; k++) {
                g.fillStyle = k % 2 ? cB : cA;
                g.fillRect(cx - hw + k * pw, base - ch - 1, pw + 0.6, ch + 2);
            }
            g.fillStyle = 'rgba(0,0,0,0.25)';
            g.fillRect(cx + hw * 0.25, base - ch - 1, hw, ch + 2);
            g.fillStyle = 'rgba(255,255,255,0.3)';
            g.beginPath();
            g.ellipse(cx - hw * 0.4, base - ch * 0.6, hw * 0.22, ch * 0.22, 0, 0, TAU);
            g.fill();
            g.restore();
            g.globalCompositeOperation = 'destination-out';
            for (let k = 0; k < n; k++) {
                g.beginPath();
                g.arc(cx - hw + (k + 0.5) * pw, base + 0.5, pw * 0.42, Math.PI, TAU);
                g.fill();
            }
            g.globalCompositeOperation = 'source-over';
        }, '#1c1022')),

        cloudBand: (w) => cached('clouds' + w, () => pixelSprite(w, 36, g => {
            const puffs = [];
            for (let x = -10; x < w + 10; x += rand(9, 16)) puffs.push([x, rand(6, 16), rand(10, 16)]);
            const layers = [['#363e50', 0, 0], ['#4e5970', -3, -3], ['#6f7c96', -6, -7]];
            for (const [col, dy, dr] of layers) {
                g.fillStyle = col;
                for (const [x, y, r] of puffs) circle(g, x, y + dy, Math.max(2, r + dr));
            }
        }, '#1b2030')),

        shard: (color) => cached('shard' + color, () => pixelSprite(5, 5, g => {
            g.fillStyle = color;
            g.beginPath();
            g.moveTo(rand(0, 2), rand(0, 2));
            g.lineTo(5, rand(1, 3));
            g.lineTo(rand(1, 3), 5);
            g.closePath();
            g.fill();
        }, null)),
    };

    // ---------- DOM helpers ----------
    function bannerStack() {
        let s = document.getElementById('fxBannerStack');
        if (!s) {
            s = document.createElement('div');
            s.id = 'fxBannerStack';
            document.body.appendChild(s);
        }
        return s;
    }

    // RPG dialogue window: "<user> drank a POTION!"
    function banner(theme, user, verb, item, duration = 5500) {
        const el = document.createElement('div');
        el.className = `fx-banner fx-banner--${theme}`;
        if (user) {
            const u = document.createElement('span');
            u.className = 'fx-banner__user';
            u.textContent = user;
            el.appendChild(u);
            el.appendChild(document.createTextNode(` ${verb} `));
        } else {
            el.appendChild(document.createTextNode(`${verb.charAt(0).toUpperCase()}${verb.slice(1)} `));
        }
        const it = document.createElement('span');
        it.className = 'fx-banner__item';
        it.textContent = item;
        el.appendChild(it);
        el.appendChild(document.createTextNode('!'));
        bannerStack().appendChild(el);
        setTimeout(() => el.classList.add('fx-banner--out'), duration);
        setTimeout(() => el.remove(), duration + 700);
    }

    // RPG damage-number style popup
    function floatText(text, x, y, color, duration = 2200) {
        const el = document.createElement('div');
        el.className = 'fx-float-text';
        el.textContent = text;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.setProperty('--c', color);
        el.style.animationDuration = `${duration}ms`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), duration + 100);
    }

    function vignette(theme, duration) {
        const el = document.createElement('div');
        el.className = `fx-vignette fx-vignette--${theme}`;
        el.style.animationDuration = `${duration}ms`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), duration + 100);
    }

    function shake(mag, dur) {
        add({
            update(dt, t) {
                const k = 1 - t / dur;
                if (k <= 0) return false;
                document.body.style.transform = `translate(${rand(-1, 1) * mag * k}px, ${rand(-1, 1) * mag * k}px)`;
            },
            onEnd() { document.body.style.transform = ''; }
        });
    }

    // ---------- lightning ----------
    function boltPoints(x1, y1, x2, y2, disp) {
        const out = [[x1, y1]];
        (function rec(ax, ay, bx, by, d) {
            if (d < 5) { out.push([bx, by]); return; }
            const mx = (ax + bx) / 2 + rand(-d, d);
            const my = (ay + by) / 2 + rand(-d, d) * 0.3;
            rec(ax, ay, mx, my, d / 2);
            rec(mx, my, bx, by, d / 2);
        })(x1, y1, x2, y2, disp);
        return out;
    }

    function makeStrike(x1, y1, x2, y2, branchCount = randInt(3, 6)) {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const main = boltPoints(x1, y1, x2, y2, len * 0.16);
        const branches = [];
        const dir = Math.atan2(y2 - y1, x2 - x1);
        for (let i = 0; i < branchCount; i++) {
            const [sx, sy] = main[randInt(Math.floor(main.length * 0.15), Math.floor(main.length * 0.7))];
            const bl = rand(0.12, 0.3) * len;
            const a = dir + rand(0.35, 0.9) * (Math.random() < 0.5 ? -1 : 1);
            branches.push(boltPoints(sx, sy, sx + Math.cos(a) * bl, sy + Math.sin(a) * bl, bl * 0.22));
        }
        return { main, branches, end: [x2, y2] };
    }

    function strokePath(ctx, pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
    }

    function drawStrike(ctx, s, alpha, rgb = '170,200,255', scale = 1) {
        if (alpha <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const passes = [[22, 0.07, rgb], [9, 0.22, rgb], [3.2, 0.95, '255,255,255']];
        for (const [w, a, col] of passes) {
            ctx.strokeStyle = `rgba(${col},${a * alpha})`;
            ctx.lineWidth = w * scale;
            strokePath(ctx, s.main);
            ctx.lineWidth = w * scale * 0.5;
            for (const b of s.branches) strokePath(ctx, b);
        }
        ctx.restore();
    }

    // classic flicker: on, off, on, fade
    const flicker = t => (t < 0.06 ? 1 : t < 0.1 ? 0.15 : t < 0.18 ? 0.9 : t < 0.23 ? 0.1 : Math.max(0, 0.9 - (t - 0.23) * 1.4));

    function lightning(opts = {}) {
        setup();
        const x1 = opts.x1 != null ? opts.x1 : rand(W * 0.12, W * 0.88);
        const y1 = opts.y1 != null ? opts.y1 : -20;
        const x2 = opts.x2 != null ? opts.x2 : x1 + rand(-W * 0.12, W * 0.12);
        const y2 = opts.y2 != null ? opts.y2 : rand(H * 0.55, H * 0.95);
        const rgb = opts.rgb || '170,200,255';
        const s = makeStrike(x1, y1, x2, y2);
        add({
            update(dt, t) { return t < 0.9; },
            draw(h, p, t) {
                const a = flicker(t);
                drawStrike(h, s, a, rgb, opts.scale || 1);
                h.globalCompositeOperation = 'lighter';
                drawGlow(h, rgb, x2, y2, 220, a * 0.8, true);
            }
        });
        return s;
    }

    // ======================================================================
    // POTION - HD-2D: pixel flask, bloom, light shaft, healing particles
    // ======================================================================
    function potion(user) {
        setup();
        banner('potion', user, 'drank a', 'Potion');
        vignette('potion', 7500);
        const flask = sprites.potion(), cork = sprites.cork(), cross = sprites.healCross();
        const S = 2;
        const fh = flask.height * S * PX, fw = flask.width * S * PX;
        const cx = W / 2 + rand(-W * 0.12, W * 0.12), restY = H * 0.58;
        const glowP = new Particles(), bub = new Particles(), crosses = new Particles(), bokehP = new Particles(), sparks = new Particles();
        let fx = cx, fy = H + fh, popped = false, corkP = null;
        const rings = [];

        add({
            update(dt, t) {
                fy = t < 1 ? lerp(H + fh, restY, easeOutBack(phase(t, 0, 1))) : restY + Math.sin((t - 1) * 2.2) * 8;
                fx = cx + (t > 1 && t < 1.5 ? rand(-1, 1) * PX : 0);
                const top = fy - fh / 2;
                const neckY = top + 9 * S * PX;

                if (!popped && t >= 1.5) {
                    popped = true;
                    corkP = { x: fx, y: top + 5 * S * PX, vx: rand(-200, 200), vy: -1400, rot: 0, vr: rand(-14, 14) };
                    rings.push(t);
                    for (let i = 0; i < 40; i++) {
                        const a = rand(0, TAU), sp = rand(200, 800);
                        sparks.emit({ x: fx, y: neckY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, drag: 2.5, life: rand(0.4, 0.9), size: rand(6, 14), color: pick(['150,255,190', '220,255,200', '90,255,160']) });
                    }
                    floatText('+999 HP', fx, top - 30, '#6dff9e');
                }
                if (corkP) {
                    corkP.vy += 2400 * dt;
                    corkP.x += corkP.vx * dt;
                    corkP.y += corkP.vy * dt;
                    corkP.rot += corkP.vr * dt;
                    if (corkP.y > H + 100) corkP = null;
                }
                if (popped && t < 5.2) {
                    for (let i = count(45, dt); i > 0; i--) {
                        bub.emit({ x: fx + rand(-3, 3) * PX, y: neckY, vx: rand(-180, 180), vy: rand(-750, -350), g: 380, drag: 0.6, life: rand(1, 2), sprite: sprites.bubble(randInt(1, 4)) });
                    }
                    for (let i = count(28, dt); i > 0; i--) {
                        glowP.emit({ x: rand(0, W), y: H + 20, vx: rand(-25, 25), vy: rand(-240, -90), life: rand(3, 5.5), size: rand(8, 30), color: pick(['90,255,160', '140,255,120', '60,230,200', '200,255,140']), alpha: rand(0.5, 0.9), fadeIn: 0.15 });
                    }
                    for (let i = count(6, dt); i > 0; i--) {
                        crosses.emit({ x: rand(W * 0.08, W * 0.92), y: rand(H * 0.3, H * 0.9), vy: -70, life: rand(1.2, 1.8), sprite: cross });
                    }
                    if (t - rings[rings.length - 1] > 1.1) rings.push(t);
                }
                if (t < 6) {
                    for (let i = count(2.5, dt); i > 0; i--) {
                        const left = Math.random() < 0.5;
                        bokehP.emit({ x: left ? rand(0, W * 0.25) : rand(W * 0.75, W), y: rand(H * 0.2, H), vx: rand(-10, 10), vy: rand(-40, -15), size: rand(50, 130), life: rand(2.5, 4), color: pick(['120,255,180', '180,255,140']), alpha: 0.28 });
                    }
                }
                glowP.update(dt); bub.update(dt); crosses.update(dt); bokehP.update(dt); sparks.update(dt);
                return t < 8;
            },
            draw(h, p, t) {
                const a = envelope(t, 0.2, 1, 6.3, 7.3);
                const top = fy - fh / 2;
                h.globalCompositeOperation = 'lighter';
                if (popped) {
                    const sa = a * envelope(t, 1.5, 1.8, 5, 6.5);
                    const gr = h.createLinearGradient(0, top, 0, 0);
                    gr.addColorStop(0, `rgba(160,255,200,${0.45 * sa})`);
                    gr.addColorStop(1, 'rgba(160,255,200,0)');
                    h.fillStyle = gr;
                    h.beginPath();
                    h.moveTo(fx - 40, top + 40);
                    h.lineTo(fx + 40, top + 40);
                    h.lineTo(fx + 260, -20);
                    h.lineTo(fx - 260, -20);
                    h.closePath();
                    h.fill();
                }
                drawGlow(h, '80,255,150', fx, fy, fw * 1.3 * (1 + 0.05 * Math.sin(t * 4)), 0.55 * a);
                drawGlow(h, '80,255,150', fx, fy + fh * 0.45, fw * 1.6, 0.35 * a);
                for (const r0 of rings) {
                    const k = (t - r0) / 1.6;
                    if (k < 0 || k > 1) continue;
                    const rx = lerp(fw * 0.4, W * 0.35, easeOutCubic(k));
                    h.strokeStyle = `rgba(140,255,190,${(1 - k) * 0.8})`;
                    h.lineWidth = 6 * (1 - k) + 1;
                    h.beginPath();
                    h.ellipse(fx, fy + fh * 0.45, rx, rx * 0.22, 0, 0, TAU);
                    h.stroke();
                }
                h.globalAlpha = 1;
                drawGlowParticles(h, glowP);
                drawGlowParticles(h, sparks);
                drawBokeh(h, bokehP);

                const blinkOut = t > 6.8 && Math.floor(t * 15) % 2;
                if (t < 7.3 && !blinkOut) {
                    blitPx(p, flask, fx, fy, S);
                    if (!popped) blitPx(p, cork, fx, top + 5 * S * PX, S);
                }
                if (corkP) blitPxRot(p, cork, corkP.x, corkP.y, 6, 4.5, corkP.rot, S);
                drawPixelParticles(p, bub);
                drawPixelParticles(p, crosses);
            }
        });
    }

    // ======================================================================
    // SHIELD - realistic energy barrier: hex lattice, fresnel rim, deflections
    // ======================================================================
    function shield(user) {
        setup();
        banner('shield', user, 'raised a', 'Shield');
        const R = Math.min(W, H) * 0.38;
        const cx = rand(W * 0.32, W * 0.68), cy = rand(H * 0.4, H * 0.6);
        const s = R / 10, hw = Math.sqrt(3) * s;
        const hexes = [];
        for (let row = -12; row <= 12; row++) {
            for (let col = -12; col <= 12; col++) {
                const x = col * hw + (row & 1 ? hw / 2 : 0), y = row * 1.5 * s;
                const d = Math.hypot(x, y) / R;
                if (d < 1) hexes.push({ x, y, d, seed: rand(0, TAU) });
            }
        }
        const HEX = [0, 1, 2, 3, 4, 5].map(i => [Math.cos(Math.PI / 6 + i * Math.PI / 3), Math.sin(Math.PI / 6 + i * Math.PI / 3)]);
        const impacts = [], bolts = [];
        const sparks = new Particles(), frags = new Particles();
        const schedule = [1.0, 1.4, 1.75, 2.05, 2.4, 2.7, 3.05, 3.45];
        const END = 5.4;
        let si = 0, dissolved = false;

        const hexPath = (ctx, x, y, r) => {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) ctx.lineTo(x + HEX[k][0] * r, y + HEX[k][1] * r);
            ctx.closePath();
        };

        add({
            update(dt, t) {
                while (si < schedule.length && t >= schedule[si]) {
                    si++;
                    const a = rand(0, TAU), far = Math.max(W, H) * 0.9;
                    const x = cx + Math.cos(a) * far, y = cy + Math.sin(a) * far;
                    const tx = cx + rand(-R * 0.3, R * 0.3), ty = cy + rand(-R * 0.3, R * 0.3);
                    const len = Math.hypot(tx - x, ty - y);
                    bolts.push({ x, y, vx: (tx - x) / len * 2300, vy: (ty - y) / len * 2300, hit: false, age: 0 });
                }
                for (let i = bolts.length - 1; i >= 0; i--) {
                    const b = bolts[i];
                    b.x += b.vx * dt;
                    b.y += b.vy * dt;
                    if (!b.hit && Math.hypot(b.x - cx, b.y - cy) <= R) {
                        b.hit = true;
                        const dx = b.x - cx, dy = b.y - cy, dl = Math.hypot(dx, dy) || 1;
                        const nx = dx / dl, ny = dy / dl;
                        b.x = cx + nx * R; b.y = cy + ny * R;
                        const dot = b.vx * nx + b.vy * ny;
                        b.vx = (b.vx - 2 * dot * nx) * 0.6;
                        b.vy = (b.vy - 2 * dot * ny) * 0.6;
                        impacts.push({ x: b.x - cx, y: b.y - cy, t });
                        const base = Math.atan2(ny, nx);
                        for (let k = 0; k < 32; k++) {
                            const a = base + rand(-1.3, 1.3), sp = rand(300, 1000);
                            sparks.emit({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 600, drag: 3, life: rand(0.3, 0.7), color: pick(['180,230,255', '255,255,255', '120,200,255', '255,180,140']), streak: 0.04 });
                        }
                        shake(5, 0.15);
                    }
                    if (b.hit) b.age += dt;
                    if (b.age > 0.6) bolts.splice(i, 1);
                }
                if (t > END && !dissolved) {
                    dissolved = true;
                    hexes.forEach((hx, i) => {
                        if (i % 2) return;
                        frags.emit({ x: cx + hx.x, y: cy + hx.y, vx: hx.x * rand(0.6, 1.6), vy: hx.y * rand(0.6, 1.6) - 60, g: 200, life: rand(0.6, 1.3), vr: rand(-4, 4), size: s * 0.85 });
                    });
                }
                sparks.update(dt);
                frags.update(dt);
                return t < END + 1.5;
            },
            draw(h, p, t) {
                h.globalCompositeOperation = 'lighter';
                const grow = easeOutBack(phase(t, 0, 0.55));
                let fade = 1 - phase(t, END, END + 0.35);
                if (t > END - 0.7 && Math.random() < 0.3) fade *= 0.35;
                if (fade > 0 && grow > 0) {
                    h.save();
                    h.translate(cx, cy);
                    h.scale(grow, grow);
                    h.globalAlpha = fade;
                    const body = h.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
                    body.addColorStop(0, 'rgba(40,140,255,0.03)');
                    body.addColorStop(0.75, 'rgba(60,170,255,0.1)');
                    body.addColorStop(1, 'rgba(120,220,255,0.38)');
                    h.fillStyle = body;
                    circle(h, 0, 0, R);
                    h.globalAlpha = 1;

                    const front = phase(t, 0, 0.8) * 1.3;
                    h.save();
                    h.beginPath();
                    h.arc(0, 0, R, 0, TAU);
                    h.clip();
                    h.lineWidth = 2;
                    for (const hx of hexes) {
                        let i = 0.1 + 0.06 * Math.sin(t * 2.5 + hx.seed) + hx.d * hx.d * 0.25;
                        const df = hx.d - front;
                        i += Math.exp(-df * df / 0.006) * 1.2;
                        for (const im of impacts) {
                            const age = t - im.t;
                            if (age > 1.2) continue;
                            const dd = Math.hypot(hx.x - im.x, hx.y - im.y) / R;
                            const k = 1 - age / 1.2;
                            const ring = dd - age * 1.1;
                            i += Math.exp(-ring * ring / 0.003) * k * 1.4 + Math.max(0, 0.3 - dd) * 4 * k;
                        }
                        i = Math.min(1.4, i) * fade;
                        if (i < 0.03) continue;
                        hexPath(h, hx.x, hx.y, s * 0.9);
                        h.strokeStyle = `rgba(110,210,255,${Math.min(1, i)})`;
                        h.stroke();
                        if (i > 0.35) {
                            h.fillStyle = `rgba(80,170,255,${(i - 0.35) * 0.35})`;
                            h.fill();
                        }
                    }
                    h.restore();
                    for (const [w, al] of [[34, 0.06], [16, 0.16], [6, 0.5], [2.5, 0.95]]) {
                        h.strokeStyle = `rgba(150,225,255,${al * fade})`;
                        h.lineWidth = w;
                        h.beginPath();
                        h.arc(0, 0, R, 0, TAU);
                        h.stroke();
                    }
                    h.strokeStyle = `rgba(150,230,255,${0.5 * fade})`;
                    h.lineWidth = 4;
                    h.setLineDash([R * 0.08, R * 0.05]);
                    h.rotate(t * 0.6);
                    h.beginPath();
                    h.arc(0, 0, R * 1.07, 0, TAU);
                    h.stroke();
                    h.lineWidth = 2;
                    h.setLineDash([R * 0.02, R * 0.03]);
                    h.rotate(-t * 1.5);
                    h.beginPath();
                    h.arc(0, 0, R * 1.13, 0, TAU);
                    h.stroke();
                    h.setLineDash([]);
                    h.restore();
                }
                drawGlow(h, '140,210,255', cx, cy, R * 1.6, (1 - phase(t, 0, 0.5)) * 0.8, true);

                h.lineCap = 'round';
                for (const b of bolts) {
                    const a = b.hit ? 1 - b.age / 0.6 : 1;
                    const tx = b.x - b.vx * 0.06, ty = b.y - b.vy * 0.06;
                    for (const [w, col, al] of [[16, '255,80,50', 0.3], [6, '255,170,110', 0.8], [2, '255,255,255', 1]]) {
                        h.strokeStyle = `rgba(${col},${al * a})`;
                        h.lineWidth = w;
                        h.beginPath();
                        h.moveTo(tx, ty);
                        h.lineTo(b.x, b.y);
                        h.stroke();
                    }
                    drawGlow(h, '255,120,80', b.x, b.y, 50, a, true);
                }
                for (const im of impacts) {
                    const age = t - im.t;
                    if (age < 0.4) drawGlow(h, '200,240,255', cx + im.x, cy + im.y, 120 * (1 + age * 2), 1 - age / 0.4, true);
                }
                h.globalAlpha = 1;
                drawSparks(h, sparks, 2.5);

                h.globalCompositeOperation = 'lighter';
                h.lineWidth = 2;
                for (const f of frags.list) {
                    const k = lifeOf(f);
                    h.save();
                    h.translate(f.x, f.y);
                    h.rotate(f.rot);
                    hexPath(h, 0, 0, f.size);
                    h.strokeStyle = `rgba(140,220,255,${1 - k})`;
                    h.stroke();
                    h.fillStyle = `rgba(80,170,255,${(1 - k) * 0.3})`;
                    h.fill();
                    h.restore();
                }
            }
        });
    }

    // ======================================================================
    // UMBRELLA - pixel art: storm clouds, rain, umbrellas that open and float
    // ======================================================================
    function umbrella(user) {
        setup();
        banner('umbrella', user, 'opened an', 'Umbrella');
        const palettes = shuffle([['#e63946', '#f1faee'], ['#ffb703', '#fb8500'], ['#8338ec', '#ff8fd8'], ['#06d6a0', '#118ab2'], ['#3a86ff', '#f1faee']]);
        const OPEN = [0.15, 0.4, 0.7, 1];
        const umbs = [];
        for (let i = 0; i < 4; i++) {
            const [cA, cB] = palettes[i];
            umbs.push({
                baseX: PW * (0.125 + i * 0.25) + rand(-PW * 0.04, PW * 0.04),
                targetY: PH * rand(0.4, 0.72),
                delay: i * 0.35 + rand(0, 0.15),
                ph: rand(0, TAU),
                frames: OPEN.map(o => sprites.umbrella(o, cA, cB)),
                x: 0, y: -40, open: 0, frame: 0
            });
        }
        shuffle(umbs).forEach((u, i) => { u.delay = i * 0.35 + rand(0, 0.15); });
        const drops = [];
        for (let i = 0; i < 280; i++) {
            drops.push({ x: rand(0, PW + 60), y: rand(-PH, PH), v: rand(230, 330), len: randInt(2, 4), c: pick(['#9ec9ff', '#cfe6ff', '#7fb2f0']) });
        }
        const splashes = new Particles();
        const clouds = sprites.cloudBand(PW);
        const CH = 15;

        add({
            update(dt, t) {
                for (const u of umbs) {
                    const lt = t - u.delay;
                    if (lt < 0) continue;
                    u.frame = Math.min(3, Math.floor(phase(lt, 0, 0.35) * 4));
                    u.open = OPEN[u.frame];
                    if (t < 6.2) {
                        u.y = lerp(-40, u.targetY, easeOutCubic(phase(lt, 0.2, 2))) + Math.sin(t * 1.8 + u.ph) * 2;
                        u.x = u.baseX + Math.sin(t * 1.2 + u.ph) * 3;
                    } else {
                        const e = easeInCubic(phase(t, 6.2 + u.delay * 0.2, 7.6));
                        u.y = u.targetY - e * (u.targetY + 80);
                        u.x = u.baseX + Math.sin(t * 1.2 + u.ph) * 3 + e * PW * 0.5;
                    }
                }
                const active = Math.floor(drops.length * envelope(t, 0, 0.8, 6.6, 7.6));
                for (let i = 0; i < active; i++) {
                    const d = drops[i];
                    d.y += d.v * dt;
                    d.x -= d.v * 0.15 * dt;
                    let hit = false;
                    for (const u of umbs) {
                        if (u.open < 0.7) continue;
                        const hwu = lerp(5, 32, u.open), dx = d.x - u.x;
                        if (Math.abs(dx) >= hwu) continue;
                        const top = u.y - CH * Math.sqrt(1 - (dx / hwu) * (dx / hwu));
                        if (d.y + d.len >= top && d.y <= u.y + 2) {
                            for (let k = 0; k < 2; k++) {
                                splashes.emit({ x: d.x * PX, y: top * PX, vx: rand(-120, 120) + Math.sign(dx) * 90, vy: rand(-280, -120), g: 1400, life: 0.35, color: '#d8ecff' });
                            }
                            hit = true;
                            break;
                        }
                    }
                    if (!hit && d.y > PH) {
                        if (Math.random() < 0.5) splashes.emit({ x: d.x * PX, y: H - 4, vx: rand(-80, 80), vy: rand(-200, -80), g: 1400, life: 0.25, color: '#b8d8ff' });
                        hit = true;
                    }
                    if (hit) {
                        d.y = rand(-40, -5);
                        d.x = rand(0, PW + 60);
                    }
                }
                splashes.update(dt);
                return t < 8;
            },
            draw(h, p, t) {
                const cy = lerp(-clouds.height, 0, easeOutCubic(phase(t, 0, 0.8))) - easeInCubic(phase(t, 6.8, 7.8)) * clouds.height;
                const active = Math.floor(drops.length * envelope(t, 0, 0.8, 6.6, 7.6));
                for (let i = 0; i < active; i++) {
                    const d = drops[i];
                    p.fillStyle = d.c;
                    p.fillRect(Math.round(d.x), Math.round(d.y), 1, d.len);
                }
                for (const u of umbs) {
                    if (t < u.delay) continue;
                    p.drawImage(u.frames[u.frame], Math.round(u.x - 36), Math.round(u.y - 22));
                }
                drawPixelParticles(p, splashes);
                p.drawImage(clouds, 0, Math.round(cy));
            }
        });
    }

    // ======================================================================
    // BOMB - realistic: lit fuse, fireball, shockwave, debris, lingering smoke
    // ======================================================================
    function drawBombBody(ctx, r, fuseLeft, pulse) {
        // fuse
        const fusePts = [];
        for (let i = 0; i <= 20; i++) {
            const s = (i / 20) * fuseLeft;
            fusePts.push(fusePoint(r, s));
        }
        if (fusePts.length > 1) {
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#c8a36a';
            ctx.lineWidth = r * 0.1;
            strokePath(ctx, fusePts);
            ctx.strokeStyle = '#7a5a30';
            ctx.setLineDash([r * 0.05, r * 0.06]);
            strokePath(ctx, fusePts);
            ctx.setLineDash([]);
        }
        // cap
        const cg = ctx.createLinearGradient(-r * 0.3, 0, r * 0.3, 0);
        cg.addColorStop(0, '#5a6069');
        cg.addColorStop(0.35, '#b4bac3');
        cg.addColorStop(1, '#2b2f35');
        ctx.fillStyle = cg;
        ctx.fillRect(-r * 0.3, -r * 1.12, r * 0.6, r * 0.3);
        // body
        const gr = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
        gr.addColorStop(0, '#727a88');
        gr.addColorStop(0.35, '#2a2e36');
        gr.addColorStop(1, '#060709');
        ctx.fillStyle = gr;
        circle(ctx, 0, 0, r);
        ctx.globalCompositeOperation = 'lighter';
        const rl = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r);
        rl.addColorStop(0, 'rgba(80,120,200,0)');
        rl.addColorStop(1, 'rgba(90,130,210,0.16)');
        ctx.fillStyle = rl;
        circle(ctx, 0, 0, r);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.17, r * 0.09, -0.7, 0, TAU);
        ctx.fill();
        circle(ctx, -r * 0.15, -r * 0.6, r * 0.04);
        if (pulse > 0) drawGlow(ctx, '255,40,20', 0, 0, r * 1.5, pulse);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function fusePoint(r, s) {
        // quadratic bezier from the cap to the fuse tip
        const p0 = [r * 0.05, -r * 1.1], c = [r * 0.65, -r * 1.55], p1 = [r * 0.55, -r * 1.9];
        const u = 1 - s;
        return [u * u * p0[0] + 2 * u * s * c[0] + s * s * p1[0], u * u * p0[1] + 2 * u * s * c[1] + s * s * p1[1]];
    }

    function bomb(user, opts = {}) {
        setup();
        banner('bomb', user, 'dropped a', 'Bomb');
        const r = Math.min(W, H) * 0.065;
        const bx = rand(W * 0.35, W * 0.65), by = rand(H * 0.45, H * 0.62);
        const T0 = 2.1;
        const fire = new Particles(), smoke = new Particles(), debris = new Particles(), embers = new Particles(), sparks = new Particles(), dust = new Particles();
        let exploded = false, landed = false, y = -2 * r, squash = 0;

        function explode() {
            exploded = true;
            if (opts.onExplode) opts.onExplode();
            shake(30, 1.3);
            for (let i = 0; i < 150; i++) {
                const a = rand(0, TAU), sp = rand(80, 750);
                fire.emit({ x: bx + Math.cos(a) * rand(0, r * 0.5), y: by + Math.sin(a) * rand(0, r * 0.5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, drag: 2.6, g: -90, size: rand(40, 110), grow: 45, life: rand(0.6, 1.6) });
            }
            for (let i = 0; i < 70; i++) {
                const a = rand(0, TAU), sp = rand(40, 320);
                smoke.emit({ x: bx + Math.cos(a) * r, y: by + Math.sin(a) * r * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - rand(20, 90), drag: 1.1, g: -12, size: rand(60, 140), grow: rand(20, 45), life: rand(3.5, 7), age: -rand(0.1, 0.6), variant: randInt(0, 3), shade: pick(['38,36,38', '58,55,56', '24,22,24']), vr: rand(-0.4, 0.4) });
            }
            for (let i = 0; i < 45; i++) {
                const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(400, 1200);
                const pts = [];
                const n = randInt(4, 6), rr = rand(6, 16);
                for (let k = 0; k < n; k++) pts.push([Math.cos(k / n * TAU) * rr * rand(0.6, 1.2), Math.sin(k / n * TAU) * rr * rand(0.6, 1.2)]);
                debris.emit({
                    x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1500, vr: rand(-12, 12), life: rand(2.5, 4), pts,
                    floor: by + r + rand(0, 160), hot: Math.random() < 0.6,
                    tick(p) {
                        if (p.y > p.floor && p.vy > 0) {
                            p.y = p.floor;
                            p.vy *= -0.3; p.vx *= 0.55; p.vr *= 0.5;
                            if (Math.abs(p.vy) < 80) { p.vy = 0; p.g = 0; p.vx *= 0.8; p.vr = 0; }
                        }
                        if (p.hot && Math.hypot(p.vx, p.vy) > 350 && Math.random() < 0.6) {
                            embers.emit({ x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-30, 30), life: rand(0.2, 0.5), size: rand(5, 10), color: '255,150,60' });
                        }
                    }
                });
            }
            for (let i = 0; i < 120; i++) {
                const a = rand(0, TAU), sp = rand(50, 500);
                embers.emit({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, drag: 1.4, g: -40, life: rand(1.5, 3.5), size: rand(3, 7), color: pick(['255,170,70', '255,120,40', '255,220,140']), age: -rand(0, 1.2), flick: rand(8, 20) });
            }
        }

        add({
            update(dt, t) {
                if (t < 0.55) {
                    y = lerp(-2 * r, by, Math.pow(t / 0.55, 2));
                } else if (t < 1) {
                    if (!landed) {
                        landed = true;
                        shake(6, 0.2);
                        for (let i = 0; i < 18; i++) {
                            dust.emit({ x: bx + rand(-r, r), y: by + r * 0.9, vx: rand(-260, 260), vy: rand(-80, -10), drag: 2.5, size: rand(20, 45), grow: 30, life: rand(0.6, 1.1), variant: randInt(0, 3) });
                        }
                    }
                    squash = t < 0.7 ? 0.14 * Math.sin(Math.PI * phase(t, 0.55, 0.7)) : 0;
                    y = by - Math.sin(Math.PI * phase(t, 0.7, 1)) * r * 0.5;
                } else {
                    y = by;
                    squash = 0;
                }
                if (!exploded && t > 0.7) {
                    const [fx, fy] = fusePoint(r, 1 - 0.85 * phase(t, 0.7, T0));
                    for (let i = 0; i < 5; i++) {
                        sparks.emit({ x: bx + fx, y: y + fy, vx: rand(-260, 260), vy: rand(-380, 60), g: 900, life: rand(0.2, 0.5), color: pick(['255,230,150', '255,180,60', '255,255,220']), streak: 0.025 });
                    }
                }
                if (!exploded && t >= T0) explode();
                fire.update(dt); smoke.update(dt); debris.update(dt); embers.update(dt); sparks.update(dt); dust.update(dt);
                return t < T0 + 9;
            },
            draw(h, p, t) {
                const a = t - T0;
                // scorch mark
                if (exploded) {
                    const al = 0.6 * (1 - phase(a, 6, 9));
                    h.save();
                    h.translate(bx, by + r * 0.6);
                    h.scale(1, 0.35);
                    const sg = h.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
                    sg.addColorStop(0, `rgba(10,6,4,${al})`);
                    sg.addColorStop(0.6, `rgba(25,15,8,${al * 0.6})`);
                    sg.addColorStop(1, 'rgba(25,15,8,0)');
                    h.fillStyle = sg;
                    circle(h, 0, 0, r * 2.6);
                    h.restore();
                }
                // dust (landing)
                for (const d of dust.list) {
                    const k = lifeOf(d);
                    h.globalAlpha = 0.45 * (1 - k);
                    h.drawImage(smokeSprite('190,170,150', d.variant), d.x - d.size, d.y - d.size, d.size * 2, d.size * 2);
                }
                // smoke
                for (const sm of smoke.list) {
                    if (sm.age < 0) continue;
                    const k = lifeOf(sm);
                    h.globalAlpha = 0.85 * Math.min(1, sm.age / 0.4) * Math.pow(1 - k, 0.8);
                    h.save();
                    h.translate(sm.x, sm.y);
                    h.rotate(sm.rot);
                    h.drawImage(smokeSprite(sm.shade, sm.variant), -sm.size, -sm.size, sm.size * 2, sm.size * 2);
                    h.restore();
                }
                h.globalAlpha = 1;
                // bomb
                if (!exploded) {
                    h.save();
                    h.globalAlpha = 0.35;
                    h.fillStyle = '#000';
                    h.beginPath();
                    const shadowK = clamp(1 - (by - y) / (H * 0.6), 0.2, 1);
                    h.ellipse(bx, by + r * 0.95, r * 1.1 * shadowK, r * 0.25 * shadowK, 0, 0, TAU);
                    h.fill();
                    h.globalAlpha = 1;
                    const pulse = phase(t, 1.3, T0) * (0.5 + 0.5 * Math.sin(t * 30));
                    const wob = 1 + 0.06 * pulse;
                    h.translate(bx, y);
                    h.scale((1 + squash) * wob, (1 - squash) * wob);
                    drawBombBody(h, r, t > 0.7 ? 1 - 0.85 * phase(t, 0.7, T0) : 1, pulse * 0.8);
                    h.restore();
                }
                // debris
                for (const d of debris.list) {
                    const k = lifeOf(d);
                    h.save();
                    h.translate(d.x, d.y);
                    h.rotate(d.rot);
                    h.globalAlpha = 1 - phase(k, 0.7, 1);
                    h.fillStyle = '#231d19';
                    h.beginPath();
                    d.pts.forEach(([px, py], i) => (i ? h.lineTo(px, py) : h.moveTo(px, py)));
                    h.closePath();
                    h.fill();
                    h.strokeStyle = 'rgba(120,90,60,0.6)';
                    h.lineWidth = 1.5;
                    h.stroke();
                    if (d.hot) {
                        h.globalCompositeOperation = 'lighter';
                        drawGlow(h, '255,120,40', 0, 0, 22, 0.8 * (1 - phase(d.age, 0, 1.8)));
                        h.globalCompositeOperation = 'source-over';
                    }
                    h.restore();
                }
                h.globalAlpha = 1;
                // fireball
                h.globalCompositeOperation = 'lighter';
                for (const f of fire.list) {
                    const k = lifeOf(f);
                    const col = k < 0.15 ? '255,240,200' : k < 0.35 ? '255,190,80' : k < 0.6 ? '255,110,30' : '160,40,10';
                    drawGlow(h, col, f.x, f.y, f.size, (k < 0.6 ? 0.55 : 0.35) * (1 - k), k < 0.12);
                }
                for (const e of embers.list) {
                    if (e.age < 0) continue;
                    const k = lifeOf(e);
                    const fl = e.flick ? 0.6 + 0.4 * Math.sin(e.age * e.flick) : 1;
                    drawGlow(h, e.color, e.x, e.y, e.size, (1 - k) * fl, true);
                }
                h.globalAlpha = 1;
                drawSparks(h, sparks, 2);
                if (!exploded && t > 0.7) {
                    const [fx, fy] = fusePoint(r, 1 - 0.85 * phase(t, 0.7, T0));
                    h.globalCompositeOperation = 'lighter';
                    drawGlow(h, '255,190,90', bx + fx, y + fy, rand(30, 50), 1, true);
                }
                if (exploded) {
                    h.globalCompositeOperation = 'lighter';
                    if (a < 0.7) {
                        const k = a / 0.7, rr = easeOutCubic(k) * W * 0.6;
                        h.globalAlpha = 1;
                        h.strokeStyle = `rgba(255,220,180,${0.4 * (1 - k)})`;
                        h.lineWidth = 50 * (1 - k) + 2;
                        h.beginPath();
                        h.arc(bx, by, rr, 0, TAU);
                        h.stroke();
                        h.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
                        h.lineWidth = 4;
                        h.beginPath();
                        h.arc(bx, by, rr * 0.97, 0, TAU);
                        h.stroke();
                    }
                    drawGlow(h, '255,140,40', bx, by, W * 0.45, 0.9 * (1 - phase(a, 0, 1.6)), true);
                    if (a < 0.25) {
                        h.globalAlpha = 1;
                        h.fillStyle = `rgba(255,245,230,${0.85 * (1 - a / 0.25)})`;
                        h.fillRect(0, 0, W, H);
                    }
                    if (a < 1.2) {
                        h.globalCompositeOperation = 'source-over';
                        const k = a / 1.2, rx = easeOutCubic(k) * W * 0.45;
                        h.strokeStyle = `rgba(200,170,140,${0.5 * (1 - k)})`;
                        h.lineWidth = 18 * (1 - k) + 2;
                        h.beginPath();
                        h.ellipse(bx, by + r, rx, rx * 0.16, 0, 0, TAU);
                        h.stroke();
                    }
                }
            }
        });
    }

    // ======================================================================
    // SUN STONE - HD-2D: spinning pixel gem absorbs light, then bursts into god rays
    // ======================================================================
    function sunStone(user, opts = {}) {
        setup();
        banner('sun', user, 'shattered a', 'Sun Stone');
        vignette('sun', 7500);
        const stone = sprites.sunStone(), S = 2;
        const cx = W / 2, cy = H * 0.45;
        const BURST = 2.2;
        const motes = new Particles(), shards = new Particles(), twinkles = new Particles(), bokehP = new Particles();
        const shardSprites = ['#fff3b0', '#ffc233', '#ff9a1a', '#ffe066'].map(c => sprites.shard(c));
        const sparkle = sprites.sparkle();
        let sy = H + 200, spin = 0, burst = false;

        add({
            update(dt, t) {
                sy = t < 1.2 ? lerp(H + 200, cy, easeOutBack(phase(t, 0, 1.2))) : cy + Math.sin(t * 2) * 6;
                spin += dt * lerp(2, 20, phase(t, 0.8, BURST));
                if (!burst && t < BURST) {
                    for (let i = count(70 * phase(t, 0.3, 1.2), dt); i > 0; i--) {
                        const a = rand(0, TAU), rr = rand(350, 750), sp = rand(350, 650);
                        motes.emit({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp, life: rr / sp, size: rand(5, 12), color: pick(['255,220,120', '255,240,190', '255,180,60']), alpha: 0.9, fadeIn: 0.3 });
                    }
                }
                if (!burst && t >= BURST) {
                    burst = true;
                    if (opts.onBurst) opts.onBurst();
                    shake(10, 0.4);
                    for (let i = 0; i < 36; i++) {
                        const a = rand(0, TAU), sp = rand(300, 1000);
                        shards.emit({ x: cx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, g: 1000, drag: 0.5, life: rand(1.2, 2.2), sprite: pick(shardSprites) });
                    }
                }
                if (burst && t < 6.5) {
                    for (let i = count(14, dt); i > 0; i--) {
                        twinkles.emit({ x: rand(0, W), y: rand(0, H * 0.85), life: rand(0.5, 1), sprite: sparkle });
                    }
                    for (let i = count(4, dt); i > 0; i--) {
                        bokehP.emit({ x: rand(0, W), y: rand(0, H), vx: rand(-15, 15), vy: rand(-30, -10), size: rand(50, 140), life: rand(2.5, 4), color: pick(['255,210,120', '255,240,180']), alpha: 0.3 });
                    }
                }
                motes.update(dt); shards.update(dt); twinkles.update(dt); bokehP.update(dt);
                return t < 7.5;
            },
            draw(h, p, t) {
                h.globalCompositeOperation = 'lighter';
                if (!burst) {
                    const charge = phase(t, 0.8, BURST);
                    drawGlow(h, '255,200,80', cx, sy, 160 + 160 * charge, 0.6 + 0.3 * Math.sin(t * 20) * charge, true);
                    drawGlowParticles(h, motes);
                    blitPx(p, stone, cx, sy, S, Math.cos(spin));
                } else {
                    const ra = envelope(t, BURST, BURST + 0.25, 5.5, 7);
                    const len = Math.hypot(W, H);
                    drawRays(h, cx, cy, 16, t * 0.25, len, W * 0.06, '255,225,140', 0.55 * ra);
                    drawRays(h, cx, cy, 11, -t * 0.4 + 0.3, len, W * 0.025, '255,255,225', 0.45 * ra);
                    drawGlow(h, '255,230,160', cx, cy, 420, ra * 0.9, true);
                    const a = t - BURST;
                    if (a < 0.35) {
                        h.globalAlpha = 1;
                        h.fillStyle = `rgba(255,240,200,${0.75 * (1 - a / 0.35)})`;
                        h.fillRect(0, 0, W, H);
                    }
                    if (a < 1.1) {
                        const k = a / 1.1;
                        h.globalAlpha = 1;
                        h.strokeStyle = `rgba(255,220,140,${0.7 * (1 - k)})`;
                        h.lineWidth = 34 * (1 - k) + 2;
                        h.beginPath();
                        h.arc(cx, cy, easeOutCubic(k) * W * 0.7, 0, TAU);
                        h.stroke();
                    }
                    drawBokeh(h, bokehP);
                }
                drawPixelParticles(p, shards);
                drawPixelParticles(p, twinkles);
            }
        });
    }

    // ======================================================================
    // RAIN STONE - HD-2D: crackling pixel gem gets struck by a real lightning bolt
    // ======================================================================
    function rainStone(user, opts = {}) {
        setup();
        banner('storm', user, 'shattered a', 'Rain Stone');
        vignette('storm', 6500);
        const stone = sprites.rainStone(), S = 2;
        const cx = W / 2 + rand(-W * 0.1, W * 0.1), cy = H * 0.5;
        const STRIKE = 2.3;
        const shards = new Particles(), drops = new Particles(), crackle = new Particles();
        const shardSprites = ['#c9eeff', '#5fb0ff', '#2258d8', '#e2f7ff'].map(c => sprites.shard(c));
        const arcs = [];
        let sy = H + 200, struck = false, nextArc = STRIKE - 1.3;

        const drawRunes = (h, p, t, front) => {
            for (let i = 0; i < 8; i++) {
                const a = t * 2 + i * TAU / 8;
                const depth = Math.sin(a);
                if ((depth >= 0) !== front) continue;
                const x = cx + Math.cos(a) * 150, y = sy + depth * 40;
                p.fillStyle = front ? '#bff6ff' : '#5aa9c9';
                p.fillRect(Math.round(x / PX) - 1, Math.round(y / PX) - 1, 2, 2);
                drawGlow(h, '120,220,255', x, y, front ? 30 : 18, 0.8);
            }
        };

        add({
            update(dt, t) {
                sy = t < 1.2 ? lerp(H + 200, cy, easeOutBack(phase(t, 0, 1.2))) : cy + Math.sin(t * 2.4) * 6;
                if (!struck && t >= nextArc && t < STRIKE) {
                    nextArc = t + rand(0.05, 0.12);
                    const a = rand(0, TAU), rr = rand(90, 220);
                    arcs.push({ s: makeStrike(cx, sy, cx + Math.cos(a) * rr, sy + Math.sin(a) * rr, 1), t0: t });
                }
                if (!struck && t >= STRIKE) {
                    struck = true;
                    lightning({ x1: cx + rand(-160, 160), y1: -20, x2: cx, y2: sy, rgb: '150,200,255', scale: 1.6 });
                    if (opts.onStrike) opts.onStrike();
                    shake(16, 0.5);
                    for (let i = 0; i < 40; i++) {
                        const a = rand(0, TAU), sp = rand(300, 1100);
                        shards.emit({ x: cx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 250, g: 1200, drag: 0.4, life: rand(1, 2), sprite: pick(shardSprites) });
                    }
                    for (let i = 0; i < 60; i++) {
                        drops.emit({ x: cx + rand(-20, 20), y: sy, vx: rand(-500, 500), vy: rand(-1100, -300), g: 1800, life: rand(0.8, 1.5), color: pick(['#9fd8ff', '#d8f0ff', '#5fb0ff']), px: randInt(1, 2) });
                    }
                }
                if (struck && t < STRIKE + 1.6) {
                    for (let i = count(25, dt); i > 0; i--) {
                        crackle.emit({ x: cx + rand(-260, 260), y: sy + rand(-200, 200), vx: rand(-40, 40), vy: rand(60, 200), life: rand(0.2, 0.5), size: rand(6, 14), color: '150,220,255', core: true });
                    }
                }
                for (let i = arcs.length - 1; i >= 0; i--) if (t - arcs[i].t0 > 0.12) arcs.splice(i, 1);
                shards.update(dt); drops.update(dt); crackle.update(dt);
                return t < STRIKE + 2.8;
            },
            draw(h, p, t) {
                h.globalCompositeOperation = 'lighter';
                if (!struck) {
                    const charge = phase(t, 1, STRIKE);
                    drawGlow(h, '80,160,255', cx, sy, 170 + 120 * charge, 0.55 + 0.35 * Math.sin(t * 25) * charge, true);
                    drawRunes(h, p, t, false);
                    blitPx(p, stone, cx, sy, S);
                    drawRunes(h, p, t, true);
                    for (const a of arcs) drawStrike(h, a.s, 1 - (t - a.t0) / 0.12, '120,220,255', 0.8);
                } else {
                    const a = t - STRIKE;
                    if (a < 0.3) {
                        h.globalAlpha = 1;
                        h.fillStyle = `rgba(220,235,255,${0.8 * (1 - a / 0.3)})`;
                        h.fillRect(0, 0, W, H);
                    }
                    if (a < 0.9) {
                        const k = a / 0.9;
                        h.globalAlpha = 1;
                        h.strokeStyle = `rgba(140,210,255,${0.8 * (1 - k)})`;
                        h.lineWidth = 30 * (1 - k) + 2;
                        h.beginPath();
                        h.arc(cx, sy, easeOutCubic(k) * W * 0.55, 0, TAU);
                        h.stroke();
                    }
                    drawGlow(h, '120,190,255', cx, sy, 380, 1 - phase(a, 0, 1.5), true);
                    drawGlowParticles(h, crackle);
                }
                drawPixelParticles(p, shards);
                drawPixelParticles(p, drops);
            }
        });
    }

    // ======================================================================
    // SHOVEL - pixel shovel swings in and flings realistic mud at the "camera"
    // ======================================================================
    function makeSplat(S) {
        const size = Math.ceil(S * 1.9), C = size / 2, R = S * 0.36;
        const c = makeCanvas(size, size), g = c.getContext('2d');
        g.translate(C, C);
        const a1 = rand(0, TAU), a2 = rand(0, TAU);
        const body = new Path2D();
        const N = 72;
        const pts = [];
        for (let i = 0; i < N; i++) {
            const th = i / N * TAU;
            const rr = R * (0.82 + 0.1 * Math.sin(3 * th + a1) + 0.07 * Math.sin(7 * th + a2) + rand(-0.025, 0.025));
            pts.push([Math.cos(th) * rr, Math.sin(th) * rr]);
        }
        body.moveTo((pts[0][0] + pts[N - 1][0]) / 2, (pts[0][1] + pts[N - 1][1]) / 2);
        for (let i = 0; i < N; i++) {
            const p0 = pts[i], p1 = pts[(i + 1) % N];
            body.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
        }
        body.closePath();
        const extras = new Path2D();
        for (let i = randInt(7, 13); i > 0; i--) {
            const th = rand(0, TAU), len = R * rand(0.35, 0.95), w = R * rand(0.06, 0.12);
            const r0 = R * 0.75;
            const bx = Math.cos(th) * r0, by = Math.sin(th) * r0;
            const tx = Math.cos(th) * (r0 + len), ty = Math.sin(th) * (r0 + len);
            const nx = -Math.sin(th) * w, ny = Math.cos(th) * w;
            extras.moveTo(bx + nx, by + ny);
            extras.lineTo(tx, ty);
            extras.lineTo(bx - nx, by - ny);
            extras.closePath();
            extras.moveTo(tx + w * 0.9, ty);
            extras.arc(tx, ty, w * 0.9, 0, TAU);
        }
        for (let i = randInt(10, 20); i > 0; i--) {
            const th = rand(0, TAU), d = R * rand(1.15, 1.75), rr = R * rand(0.03, 0.09);
            const x = Math.cos(th) * d, y = Math.sin(th) * d;
            extras.moveTo(x + rr, y);
            extras.arc(x, y, rr, 0, TAU);
        }
        const mud = g.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R * 1.7);
        mud.addColorStop(0, '#7d5538');
        mud.addColorStop(0.5, '#4b3220');
        mud.addColorStop(1, '#2a1a10');
        g.shadowColor = 'rgba(0,0,0,0.45)';
        g.shadowBlur = 14;
        g.shadowOffsetY = 6;
        g.fillStyle = mud;
        g.fill(body);
        g.fill(extras);
        g.shadowColor = 'transparent';
        g.save();
        g.clip(body);
        for (let i = 0; i < 50; i++) {
            g.fillStyle = Math.random() < 0.6 ? 'rgba(25,15,8,0.35)' : 'rgba(150,110,75,0.25)';
            circle(g, rand(-R, R), rand(-R, R), rand(1, R * 0.06));
        }
        g.lineWidth = R * 0.14;
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.stroke(body);
        const gloss = g.createRadialGradient(-R * 0.35, -R * 0.4, 0, -R * 0.35, -R * 0.4, R * 0.75);
        gloss.addColorStop(0, 'rgba(255,240,220,0.3)');
        gloss.addColorStop(1, 'rgba(255,240,220,0)');
        g.fillStyle = gloss;
        g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
        g.restore();
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.beginPath();
        g.ellipse(-R * 0.4, -R * 0.45, R * 0.12, R * 0.05, -0.6, 0, TAU);
        g.fill();
        circle(g, -R * 0.2, -R * 0.55, R * 0.025);

        const drips = [];
        for (let i = randInt(1, 3); i > 0; i--) {
            drips.push({ dx: rand(-R * 0.5, R * 0.5), dy: R * rand(0.45, 0.65), w: R * rand(0.07, 0.13), maxL: R * rand(0.6, 1.8), dur: rand(5, 9) });
        }
        return { canvas: c, drips };
    }

    function shovel(user, opts = {}) {
        setup();
        banner('shovel', user, 'flung mud with a', 'Shovel');
        const tool = sprites.shovel(), mudLoad = sprites.shovelMud();
        const SC = 2, OX = 11, OY = 74, TIP = 66; // pivot at the grip, blade tip 66 sprite px away
        const FLING = 0.62;
        const dirt = new Particles();
        const globs = [], splats = [];
        let angle = -1.2, pvx = -W * 0.05, pvy = H * 1.2, flung = false, firstSplat = false;
        const tipPos = () => [pvx + Math.sin(angle) * TIP * SC * PX, pvy - Math.cos(angle) * TIP * SC * PX];

        add({
            update(dt, t) {
                if (t < 0.45) {
                    const k = easeOutCubic(phase(t, 0, 0.45));
                    angle = lerp(-1.2, -0.95, k);
                    pvx = lerp(-W * 0.05, W * 0.28, k);
                    pvy = lerp(H * 1.2, H * 1.0, k);
                } else if (t < 0.7) {
                    angle = lerp(-0.95, 0.55, easeInCubic(phase(t, 0.45, 0.7)));
                } else if (t < 0.95) {
                    angle = lerp(0.55, 0.75, easeOutCubic(phase(t, 0.7, 0.95)));
                } else {
                    const k = easeInOutSine(phase(t, 0.95, 1.6));
                    angle = lerp(0.75, -1.4, k);
                    pvx = lerp(W * 0.28, -W * 0.15, k);
                    pvy = lerp(H * 1.0, H * 1.2, k);
                }
                if (!flung && t >= FLING) {
                    flung = true;
                    const [sx, sy] = tipPos();
                    const n = randInt(8, 12);
                    for (let i = 0; i < n; i++) {
                        globs.push({ sx, sy, tx: rand(W * 0.1, W * 0.9), ty: rand(H * 0.1, H * 0.8), S: rand(200, 450), d: rand(0.35, 0.6), t0: t + i * 0.035, arc: rand(150, 350), rot: rand(0, TAU) });
                    }
                    for (let i = 0; i < 40; i++) {
                        const a = rand(-1.4, -0.2), sp = rand(400, 1100);
                        dirt.emit({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1600, life: rand(0.6, 1.2), color: pick(['#6b4528', '#4a2f1a', '#8a5c38']), px: randInt(1, 2) });
                    }
                }
                for (let i = globs.length - 1; i >= 0; i--) {
                    const gl = globs[i];
                    if (t - gl.t0 >= gl.d) {
                        globs.splice(i, 1);
                        const sp = makeSplat(gl.S);
                        splats.push({ x: gl.tx, y: gl.ty, t0: t, rot: rand(0, TAU), ...sp });
                        if (!firstSplat) {
                            firstSplat = true;
                            if (opts.onFirstSplat) opts.onFirstSplat();
                        }
                    }
                }
                dirt.update(dt);
                return t < 2 || globs.length || splats.some(s => t - s.t0 < 12);
            },
            draw(h, p, t) {
                // splats (on the "glass")
                for (const s of splats) {
                    const a = t - s.t0;
                    const alpha = 1 - phase(a, 10, 12);
                    if (alpha <= 0) continue;
                    const sc = a < 0.12 ? lerp(1.3, 1, a / 0.12) : 1;
                    h.globalAlpha = alpha;
                    h.save();
                    h.translate(s.x, s.y);
                    for (const d of s.drips) {
                        const L = d.maxL * easeOutCubic(phase(a, 0.3, 0.3 + d.dur));
                        if (L <= 0) continue;
                        h.fillStyle = '#3b2717';
                        h.fillRect(d.dx - d.w / 2, d.dy, d.w, L);
                        circle(h, d.dx, d.dy + L, d.w * 0.75);
                        h.fillStyle = 'rgba(255,230,200,0.18)';
                        h.fillRect(d.dx - d.w / 2 + 1, d.dy, Math.max(1, d.w * 0.2), L);
                    }
                    h.rotate(s.rot);
                    h.scale(sc, sc);
                    h.drawImage(s.canvas, -s.canvas.width / 2, -s.canvas.height / 2);
                    h.restore();
                }
                h.globalAlpha = 1;
                // flying globs: grow as they get closer to the camera
                for (const gl of globs) {
                    const u = (t - gl.t0) / gl.d;
                    if (u < 0) continue;
                    const x = lerp(gl.sx, gl.tx, u), y = lerp(gl.sy, gl.ty, u) - Math.sin(Math.PI * u) * gl.arc;
                    const rr = gl.S * 0.16 * (0.2 + 0.8 * u * u);
                    const gr = h.createRadialGradient(x - rr * 0.3, y - rr * 0.35, 0, x, y, rr * 1.2);
                    gr.addColorStop(0, '#9a6b47');
                    gr.addColorStop(0.5, '#5a3a22');
                    gr.addColorStop(1, '#2e1d11');
                    h.fillStyle = gr;
                    circle(h, x, y, rr);
                    circle(h, x + Math.cos(gl.rot + u * 6) * rr * 0.7, y + Math.sin(gl.rot + u * 6) * rr * 0.7, rr * 0.45);
                    h.fillStyle = 'rgba(255,240,220,0.4)';
                    circle(h, x - rr * 0.35, y - rr * 0.4, rr * 0.15);
                }
                // pixel shovel
                if (t < 1.6) {
                    blitPxRot(p, tool, pvx, pvy, OX, OY, angle, SC);
                    if (!flung) blitPxRot(p, mudLoad, pvx, pvy, OX, OY, angle, SC);
                }
                drawPixelParticles(p, dirt);
            }
        });
    }

    // ======================================================================
    // DICE - realistic 3D dice with physics, shadows, dust and a result reveal
    // ======================================================================
    const PIPS = {
        1: [[2, 2]],
        2: [[1, 1], [3, 3]],
        3: [[1, 1], [2, 2], [3, 3]],
        4: [[1, 1], [1, 3], [3, 1], [3, 3]],
        5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
        6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]]
    };
    // which face is where, and the rotation that brings it to face the viewer
    const FACES = [['front', 1], ['back', 6], ['right', 4], ['left', 3], ['top', 2], ['bottom', 5]];
    const FACE_ROT = { 1: [0, 0], 6: [0, 180], 4: [0, -90], 3: [0, 90], 2: [-90, 0], 5: [90, 0] };

    function dieHTML(color) {
        const faces = FACES.map(([name, n]) => {
            const pips = PIPS[n].map(([r, c]) => `<span class="fx-pip" style="grid-row:${r};grid-column:${c}"></span>`).join('');
            return `<div class="fx-die__face fx-die__face--${name}">${pips}</div>`;
        }).join('');
        const cores = ['x', 'y', 'z'].map(a => `<div class="fx-die__core fx-die__core--${a}"></div>`).join('');
        return `<div class="fx-die fx-die--${color}">${cores}${faces}</div>`;
    }

    function dice(d1, d2, user) {
        setup();
        const size = Math.round(Math.min(W, H) * 0.17);
        const floorY = H * 0.86, rest = floorY - size / 2;
        const layer = document.createElement('div');
        layer.className = 'fx-dice-layer';
        document.body.appendChild(layer);
        const dust = new Particles(), sparks = new Particles();

        const makeDie = (val, color, fromLeft, targetX, delay) => {
            const shadow = document.createElement('div');
            shadow.className = 'fx-die-shadow';
            shadow.style.width = `${size * 1.3}px`;
            shadow.style.height = `${size * 0.32}px`;
            const wrap = document.createElement('div');
            wrap.className = 'fx-die-wrap';
            wrap.style.setProperty('--s', `${size}px`);
            wrap.innerHTML = dieHTML(color);
            layer.appendChild(shadow);
            layer.appendChild(wrap);

            // simulate the throw once; x motion is linear in the starting speed,
            // so the path is then rescaled to land exactly on targetX
            const x0 = fromLeft ? -size : W + size;
            let x = x0, y = H * rand(0.15, 0.3), vx = (fromLeft ? 1 : -1) * 1000, vy = -rand(300, 600);
            const step = 1 / 120, traj = [], bounces = [];
            let grounded = false;
            for (let i = 0; i < 2400; i++) {
                traj.push([x, y]);
                if (grounded) {
                    vx *= 1 - 3.2 * step;
                    if (Math.abs(vx) < 15) break;
                } else {
                    vy += 3000 * step;
                }
                x += vx * step;
                y += vy * step;
                if (y >= rest) {
                    y = rest;
                    if (!grounded) {
                        bounces.push({ t: i * step, v: vy });
                        vy = -vy * 0.42;
                        vx *= 0.82;
                        if (Math.abs(vy) < 160) { vy = 0; grounded = true; }
                    }
                }
            }
            const endX = traj[traj.length - 1][0];
            const k = (targetX - x0) / (endX - x0);
            const [fx, fy] = FACE_ROT[val];
            return {
                wrap, shadow, cube: wrap.firstElementChild, delay, k, x0, traj, bounces, bi: 0,
                T: traj.length * step,
                final: { x: fx, y: fy, z: rand(-12, 12) },
                spin: { x: 360 * randInt(3, 4), y: 360 * randInt(2, 3), z: rand(-360, 360) },
                x: x0, y: traj[0][1]
            };
        };

        const dice = [
            makeDie(d1, 'red', true, W * 0.43, 0),
            makeDie(d2, 'white', false, W * 0.57, 0.15)
        ];
        const settle = Math.max(...dice.map(d => d.T + d.delay));
        const total = d1 + d2;
        let revealed = false, shook = false;
        const crit = d1 === 6 && d2 === 6, fail = d1 === 1 && d2 === 1;
        const END = settle + 5.6;

        add({
            update(dt, t) {
                for (const d of dice) {
                    const lt = Math.max(0, t - d.delay);
                    const i = Math.min(d.traj.length - 1, Math.floor(lt * 120));
                    d.x = d.x0 + (d.traj[i][0] - d.x0) * d.k;
                    d.y = d.traj[i][1];
                    while (d.bi < d.bounces.length && lt >= d.bounces[d.bi].t) {
                        const b = d.bounces[d.bi++];
                        const n = Math.min(14, Math.floor(Math.abs(b.v) / 120));
                        for (let j = 0; j < n; j++) {
                            dust.emit({ x: d.x + rand(-size * 0.4, size * 0.4), y: floorY, vx: rand(-220, 220), vy: rand(-90, -10), drag: 2.4, size: rand(18, 40), grow: 35, life: rand(0.5, 1), variant: randInt(0, 3) });
                        }
                        if (!shook) { shook = true; shake(8, 0.25); }
                    }
                    const e = easeOutCubic(clamp(lt / d.T));
                    const rx = d.final.x + d.spin.x * (1 - e), ry = d.final.y + d.spin.y * (1 - e), rz = d.final.z + d.spin.z * (1 - e);
                    d.wrap.style.transform = `translate3d(${d.x - size / 2}px, ${d.y - size / 2}px, 0)`;
                    d.cube.style.transform = `rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg)`;
                    const hk = clamp(1 - (rest - d.y) / 700, 0.35, 1);
                    d.shadow.style.transform = `translate3d(${d.x - size * 0.65}px, ${floorY - size * 0.16}px, 0) scale(${hk})`;
                    d.shadow.style.opacity = (0.6 * hk).toFixed(3);
                }
                if (!revealed && t >= settle + 0.2) {
                    revealed = true;
                    reveal();
                }
                if (t > END - 1.2 && !layer.classList.contains('fx-dice-layer--out')) layer.classList.add('fx-dice-layer--out');
                dust.update(dt);
                sparks.update(dt);
                return t < END;
            },
            draw(h, p, t) {
                for (const d of dust.list) {
                    const k = lifeOf(d);
                    h.globalAlpha = 0.4 * (1 - k);
                    h.drawImage(smokeSprite('220,210,195', d.variant), d.x - d.size, d.y - d.size, d.size * 2, d.size * 2);
                }
                h.globalAlpha = 1;
                if (revealed && crit) {
                    const a = envelope(t, settle + 0.2, settle + 0.5, END - 1.5, END - 0.5);
                    drawRays(h, W / 2, floorY - size * 1.9, 18, t * 0.5, Math.hypot(W, H) * 0.6, W * 0.05, '255,215,90', 0.45 * a);
                }
                drawGlowParticles(h, sparks);
            },
            onEnd() { layer.remove(); }
        });

        function reveal() {
            const el = document.createElement('div');
            el.className = 'fx-dice-total' + (crit ? ' fx-dice-total--crit' : '') + (fail ? ' fx-dice-total--fail' : '');
            el.style.left = `${W / 2}px`;
            el.style.top = `${floorY - size * 1.9}px`;
            if (user) {
                const who = document.createElement('div');
                who.className = 'fx-dice-total__who';
                who.textContent = `${user} rolled`;
                el.appendChild(who);
            }
            const num = document.createElement('div');
            num.className = 'fx-dice-total__num';
            num.textContent = String(total);
            el.appendChild(num);
            const tagText = crit ? 'CRITICAL!' : fail ? 'CRITICAL FAIL' : d1 === d2 ? 'DOUBLES!' : '';
            if (tagText) {
                const tag = document.createElement('div');
                tag.className = 'fx-dice-total__tag';
                tag.textContent = tagText;
                el.appendChild(tag);
            }
            layer.appendChild(el);
            const burstRgb = fail ? '255,80,60' : '255,210,90';
            for (let i = 0; i < (crit ? 80 : 30); i++) {
                const a = rand(0, TAU), sp = rand(150, crit ? 900 : 500);
                sparks.emit({ x: W / 2, y: floorY - size * 1.9, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, g: 200, life: rand(0.6, 1.4), size: rand(6, 14), color: burstRgb, core: true });
            }
            if (crit) shake(10, 0.4);
            if (fail) { shake(14, 0.5); vignette('fail', 3500); }
        }
    }

    window.CloudFX = { potion, shield, umbrella, bomb, sunStone, rainStone, shovel, dice, lightning };
})();
