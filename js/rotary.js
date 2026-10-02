/* ============================================================
   rotary-quest 共通ジオメトリ／描画ヘルパー
   ロータリーエンジン（ヴァンケル型）の作図に必要な計算をまとめる。
   単位はすべて mm、角度はラジアン。座標は数学の流儀（y は上向き）で持ち、
   canvas に描くときだけ上下を反転する。
   ------------------------------------------------------------
   記号:
     e     偏心量（出力軸の中心 O からローター中心 C までの距離）
     R     創成半径（ローター中心 C から頂点までの距離）
     α     出力軸（エキセントリックシャフト）の回転角
     θ=α/3 ローター自身の回転角
   ハウジング（ペリトロコイド）: x = R cos θ + e cos 3θ, y = R sin θ + e sin 3θ
   ローターの辺: 隣り合う2頂点を通り、中点が中心から距離 dm（既定 R−2e）の円弧で近似
   ============================================================ */
(function (global) {
  "use strict";

  var RE = {};

  RE.FONT = '"GreekNu",system-ui,-apple-system,"Hiragino Sans","Yu Gothic",sans-serif';
  RE.C = {
    housing: "#1b232c", housingFill: "#efe9df",
    rotor: "#3d5f88", rotorFill: "#dbe6f1",
    shaft: "#9a6a1c", shaftFill: "#f1dfae",
    ecc: "#c8433f", ink: "#1b232c", muted: "#6a7684", gold: "#9a6a1c",
    ok: "#2f9e5c", ng: "#c8433f", grid: "#e6e0d6", axis: "#b9b0a3", paper: "#fdfbf6",
    trace: "#c8433f", chamber: ["#f6d1cc", "#d3ecdc", "#fbe9b8"], chamberLine: ["#c8433f", "#2f9e5c", "#b8860b"]
  };

  var TAU = Math.PI * 2;
  RE.TAU = TAU;
  RE.deg = function (rad) { return rad * 180 / Math.PI; };
  RE.rad = function (deg) { return deg * Math.PI / 180; };

  /* ---------- ジオメトリ ---------- */

  // ハウジング（ペリトロコイド）上の点。φ はローター角に相当するパラメータ
  RE.housingPoint = function (e, R, phi) {
    return { x: R * Math.cos(phi) + e * Math.cos(3 * phi), y: R * Math.sin(phi) + e * Math.sin(3 * phi) };
  };
  RE.housing = function (e, R, N) {
    N = N || 720;
    var pts = [];
    for (var i = 0; i < N; i++) pts.push(RE.housingPoint(e, R, TAU * i / N));
    return pts;
  };
  // 出力軸角 α のときのローター中心
  RE.rotorCenter = function (e, alpha) {
    return { x: e * Math.cos(alpha), y: e * Math.sin(alpha) };
  };
  // 出力軸角 α のときの頂点 k（0,1,2）
  RE.apex = function (e, R, alpha, k) {
    var c = RE.rotorCenter(e, alpha), t = alpha / 3 + TAU * k / 3;
    return { x: c.x + R * Math.cos(t), y: c.y + R * Math.sin(t) };
  };
  RE.apexes = function (e, R, alpha) {
    return [0, 1, 2].map(function (k) { return RE.apex(e, R, alpha, k); });
  };

  // 辺の円弧: 弦の長さ R√3、矢の高さ s = dm − R/2、半径 ρ = ((R√3/2)² + s²) / (2s)
  // s < 0（dm < R/2、K < 4 のとき）は辺が内側に曲がる。ρ は負になり、円弧の中心は辺の外側にある
  RE.flankArc = function (R, dm) {
    var s = dm - R / 2;
    if (Math.abs(s) <= 1e-9) return { rho: Infinity, s: s, dist: -Infinity };
    var rho = (3 * R * R / 4 + s * s) / (2 * s);
    return { rho: rho, s: s, dist: dm - rho }; // dist: ローター中心から円弧の中心までの符号付き距離（辺の中点方向が正）
  };

  // 辺 k の円弧上の点列（A→B）。dm 省略時は R−2e
  function flankPoints(e, R, alpha, k, dm, n, reverse) {
    var c = RE.rotorCenter(e, alpha), th = alpha / 3;
    var a0 = th + TAU * k / 3, a1 = a0 + TAU / 3, mid = a0 + Math.PI / 3;
    var A = { x: c.x + R * Math.cos(a0), y: c.y + R * Math.sin(a0) };
    var B = { x: c.x + R * Math.cos(a1), y: c.y + R * Math.sin(a1) };
    var arc = RE.flankArc(R, dm), pts = [], i;
    if (!isFinite(arc.rho)) {
      for (i = 0; i <= n; i++) pts.push({ x: A.x + (B.x - A.x) * i / n, y: A.y + (B.y - A.y) * i / n });
    } else {
      var cx = c.x + arc.dist * Math.cos(mid), cy = c.y + arc.dist * Math.sin(mid);
      var b0 = Math.atan2(A.y - cy, A.x - cx), b1 = Math.atan2(B.y - cy, B.x - cx), d = b1 - b0;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      var ra = Math.abs(arc.rho);
      for (i = 0; i <= n; i++) { var b = b0 + d * i / n; pts.push({ x: cx + ra * Math.cos(b), y: cy + ra * Math.sin(b) }); }
    }
    if (reverse) pts.reverse();
    return pts;
  }
  RE.flankPoints = flankPoints;

  // ローターの輪郭（多角形近似）
  RE.rotorOutline = function (e, R, alpha, dm, n) {
    n = n || 48;
    if (dm == null) dm = R - 2 * e;
    var pts = [];
    for (var k = 0; k < 3; k++) {
      var f = flankPoints(e, R, alpha, k, dm, n, false);
      f.pop(); // 次の辺の始点と重複するので落とす
      pts = pts.concat(f);
    }
    return pts;
  };

  // 部屋 k（頂点 k と頂点 k+1 の間）の輪郭：ハウジング側 → 辺 k を逆向きに
  RE.chamberPolygon = function (e, R, alpha, k, dm, n) {
    n = n || 90;
    if (dm == null) dm = R - 2 * e;
    var th = alpha / 3, pts = [];
    for (var i = 0; i <= n; i++) pts.push(RE.housingPoint(e, R, th + TAU * k / 3 + TAU / 3 * i / n));
    var f = flankPoints(e, R, alpha, k, dm, n, true);
    f.shift(); f.pop();
    return pts.concat(f);
  };
  // 多角形の面積（靴ひも公式：各辺と原点で作る三角形の符号付き面積の和）
  RE.polygonArea = function (pts) {
    var A = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; A += p.x * q.y - q.x * p.y; }
    return Math.abs(A) / 2;
  };
  RE.chamberArea = function (e, R, alpha, k, dm) {
    return RE.polygonArea(RE.chamberPolygon(e, R, alpha, k, dm, 90));
  };

  // 点 p からハウジングまでの「内側の余裕」（正なら内側、負ならはみ出し）。ローター側の点用の簡易判定
  RE.insideMargin = function (e, R, p, N) {
    N = N || 360;
    var best = Infinity;
    for (var i = 0; i < N; i++) {
      var h = RE.housingPoint(e, R, TAU * i / N), dx = h.x - p.x, dy = h.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    // 内外判定：原点からの方向で比較（ハウジングは原点まわりに星形なので方向で1点に決まる）
    var ang = Math.atan2(p.y, p.x), rp = Math.sqrt(p.x * p.x + p.y * p.y);
    var rh = radiusAt(e, R, ang);
    return rp <= rh ? best : -best;
  };
  // 原点から方向 ang に伸ばした半直線とハウジングの交点までの距離（数値解）
  function radiusAt(e, R, ang) {
    // r(θ)² = R² + e² + 2eR cos 2θ だが、方向 ang と θ は一致しないので二分法で探す
    var lo = ang - 0.8, hi = ang + 0.8, i;
    function dir(t) { var h = RE.housingPoint(e, R, t); var a = Math.atan2(h.y, h.x) - ang; while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
    for (i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (dir(lo) * dir(m) <= 0) hi = m; else lo = m; }
    var h = RE.housingPoint(e, R, (lo + hi) / 2);
    return Math.sqrt(h.x * h.x + h.y * h.y);
  }
  RE.radiusAt = radiusAt;

  // ローター輪郭の最小余裕（出力軸1周ぶんを走査）。負なら衝突
  RE.minClearance = function (e, R, dm, steps) {
    steps = steps || 36;
    var worst = Infinity;
    for (var s = 0; s < steps; s++) {
      var alpha = TAU * s / steps;
      var pts = RE.rotorOutline(e, R, alpha, dm, 24);
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], ang = Math.atan2(p.y, p.x), rp = Math.sqrt(p.x * p.x + p.y * p.y);
        var m = radiusAt(e, R, ang) - rp;
        if (m < worst) worst = m;
      }
    }
    return worst;
  };

  /* ---------- canvas ---------- */

  // 幅いっぱい・縦横比固定のキャンバスを用意し、リサイズ時に draw(st) を呼ぶ
  RE.canvas = function (id, aspect, draw) {
    var cv = document.getElementById(id);
    if (!cv) return null;
    var ctx = cv.getContext("2d");
    var st = { cv: cv, ctx: ctx, W: 0, H: 0, aspect: aspect };
    function resize() {
      var w = cv.clientWidth || (cv.parentNode && cv.parentNode.clientWidth) || 320;
      var h = Math.round(w * aspect);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.W = w; st.H = h;
      draw(st);
    }
    window.addEventListener("resize", resize);
    st.redraw = function () { draw(st); };
    st.resize = resize;
    resize();
    return st;
  };

  // mm 座標 → canvas 座標の変換器。span: 表示したい mm 幅（中心 cx,cy mm）
  RE.view = function (st, span, cx, cy, ox, oy) {
    cx = cx || 0; cy = cy || 0;
    var s = Math.min(st.W, st.H) / span;
    var X0 = ox != null ? ox : st.W / 2, Y0 = oy != null ? oy : st.H / 2;
    return {
      s: s,
      X: function (x) { return X0 + (x - cx) * s; },
      Y: function (y) { return Y0 - (y - cy) * s; },
      P: function (p) { return { x: X0 + (p.x - cx) * s, y: Y0 - (p.y - cy) * s }; }
    };
  };

  RE.path = function (ctx, v, pts, close) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var q = v.P(pts[i]);
      if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
    }
    if (close) ctx.closePath();
  };
  RE.stroke = function (ctx, color, width, dash) {
    ctx.strokeStyle = color; ctx.lineWidth = width || 1.5; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  };
  RE.fill = function (ctx, color) { ctx.fillStyle = color; ctx.fill(); };
  RE.dot = function (ctx, v, p, r, color, stroke) {
    var q = v.P(p);
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU);
    ctx.fillStyle = color; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
  };
  RE.circle = function (ctx, v, c, rmm, color, width, dash, fillColor) {
    var q = v.P(c);
    ctx.beginPath(); ctx.arc(q.x, q.y, rmm * v.s, 0, TAU);
    if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
    if (color) RE.stroke(ctx, color, width, dash);
  };
  RE.line = function (ctx, v, a, b, color, width, dash) {
    var p = v.P(a), q = v.P(b);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    RE.stroke(ctx, color, width, dash);
  };
  RE.text = function (ctx, x, y, s, color, size, weight, align, base) {
    ctx.fillStyle = color || RE.C.ink;
    ctx.font = (weight || 700) + " " + (size || 11) + "px " + RE.FONT;
    ctx.textAlign = align || "center";
    ctx.textBaseline = base || "middle";
    ctx.fillText(s, x, y);
  };
  // mm 座標にラベル（オフセットは px）
  RE.label = function (ctx, v, p, s, color, dx, dy, size, weight, align) {
    var q = v.P(p);
    RE.text(ctx, q.x + (dx || 0), q.y + (dy || 0), s, color, size, weight, align);
  };
  // 座標軸（原点 O を通る薄い十字）
  RE.axes = function (ctx, v, span) {
    RE.line(ctx, v, { x: -span, y: 0 }, { x: span, y: 0 }, RE.C.axis, 1, [4, 4]);
    RE.line(ctx, v, { x: 0, y: -span }, { x: 0, y: span }, RE.C.axis, 1, [4, 4]);
  };
  RE.arrowPx = function (ctx, x0, y0, x1, y1, color, width) {
    var a = Math.atan2(y1 - y0, x1 - x0), h = 7;
    ctx.strokeStyle = color; ctx.lineWidth = width || 1.6; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4));
    ctx.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  };
  RE.arrow = function (ctx, v, a, b, color, width) {
    var p = v.P(a), q = v.P(b);
    RE.arrowPx(ctx, p.x, p.y, q.x, q.y, color, width);
  };
  // 角度の弧（mm 座標の中心 c、px 半径 r、from→to ラジアン、数学の向き）
  RE.angleArc = function (ctx, v, c, rpx, from, to, color) {
    var q = v.P(c);
    ctx.beginPath(); ctx.arc(q.x, q.y, rpx, -from, -to, true);
    RE.stroke(ctx, color, 1.4);
  };

  // 完成図の標準描画（ハウジング・ローター・偏心軸）。opts で部品を選ぶ
  RE.drawEngine = function (ctx, v, e, R, alpha, opts) {
    opts = opts || {};
    var dm = opts.dm != null ? opts.dm : R - 2 * e;
    var hs = RE.housing(e, R, 360);
    RE.path(ctx, v, hs, true);
    if (opts.housingFill !== false) RE.fill(ctx, opts.housingFill || RE.C.housingFill);
    if (opts.chambers) {
      for (var k = 0; k < 3; k++) {
        RE.path(ctx, v, RE.chamberPolygon(e, R, alpha, k, dm, 60), true);
        RE.fill(ctx, RE.C.chamber[k]);
      }
    }
    RE.path(ctx, v, hs, true);
    RE.stroke(ctx, RE.C.housing, opts.housingWidth || 2.4);
    if (opts.rotor !== false) {
      RE.path(ctx, v, RE.rotorOutline(e, R, alpha, dm, 40), true);
      RE.fill(ctx, opts.rotorFill || RE.C.rotorFill);
      RE.stroke(ctx, RE.C.rotor, 2);
    }
    if (opts.gears) {
      var c = RE.rotorCenter(e, alpha);
      RE.circle(ctx, v, { x: 0, y: 0 }, 2 * e, RE.C.gold, 1.4, [3, 3]);
      RE.circle(ctx, v, c, 3 * e, RE.C.rotor, 1.4, [3, 3]);
    }
    if (opts.shaft !== false) {
      var cc = RE.rotorCenter(e, alpha);
      RE.circle(ctx, v, cc, opts.eccR || Math.max(1.2 * e, 6), RE.C.ecc, 1.6, null, "#f6d1cc");
      RE.circle(ctx, v, { x: 0, y: 0 }, opts.shaftR || Math.max(0.6 * e, 4), RE.C.shaft, 1.6, null, RE.C.shaftFill);
      RE.line(ctx, v, { x: 0, y: 0 }, cc, RE.C.ecc, 1.4);
      RE.dot(ctx, v, cc, 3, RE.C.ecc);
      RE.dot(ctx, v, { x: 0, y: 0 }, 3, RE.C.shaft);
    }
  };

  /* ---------- アニメーション／UI ---------- */

  RE.reducedMotion = function () {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };
  // 再生ボタンと1つのループをまとめる。tick(dt秒) を呼ぶ。
  RE.player = function (btn, tick) {
    var playing = false, last = 0, raf = 0;
    function loop(now) {
      if (!playing) return;
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      tick(dt);
      raf = requestAnimationFrame(loop);
    }
    function set(p) {
      playing = p; last = 0;
      if (btn) { btn.textContent = p ? "⏸ 止める" : "▶ 動かす"; btn.setAttribute("aria-pressed", p ? "true" : "false"); }
      if (p) raf = requestAnimationFrame(loop); else cancelAnimationFrame(raf);
    }
    if (btn) btn.addEventListener("click", function () { set(!playing); });
    return { play: function () { set(true); }, pause: function () { set(false); }, isPlaying: function () { return playing; } };
  };
  // range 入力と表示ラベルを結ぶ
  RE.bindRange = function (id, outId, fmt, onChange) {
    var el = document.getElementById(id), out = outId ? document.getElementById(outId) : null;
    if (!el) return null;
    function upd() { if (out) out.textContent = fmt ? fmt(parseFloat(el.value)) : el.value; if (onChange) onChange(parseFloat(el.value)); }
    el.addEventListener("input", upd);
    upd();
    return el;
  };
  RE.fmt = function (x, d) { return (Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); };

  /* ---------- SVG 書き出し ---------- */
  RE.toSvg = function (e, R, alpha, opts) {
    opts = opts || {};
    var dm = opts.dm != null ? opts.dm : R - 2 * e;
    var span = 2 * (R + e) * 1.15, half = span / 2;
    function P(p) { return RE.fmt(p.x, 2) + "," + RE.fmt(-p.y, 2); }
    function poly(pts) { return pts.map(P).join(" "); }
    var s = [];
    s.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (-half) + ' ' + (-half) + ' ' + span + ' ' + span + '" width="' + span + 'mm" height="' + span + 'mm">');
    s.push('<title>ロータリーエンジン作図 e=' + e + ' R=' + R + ' α=' + RE.fmt(RE.deg(alpha)) + '°</title>');
    s.push('<rect x="' + (-half) + '" y="' + (-half) + '" width="' + span + '" height="' + span + '" fill="#fff"/>');
    s.push('<polygon points="' + poly(RE.housing(e, R, 360)) + '" fill="#efe9df" stroke="#1b232c" stroke-width="1.2"/>');
    if (opts.chambers) {
      for (var k = 0; k < 3; k++) s.push('<polygon points="' + poly(RE.chamberPolygon(e, R, alpha, k, dm, 60)) + '" fill="' + RE.C.chamber[k] + '" stroke="none"/>');
      s.push('<polygon points="' + poly(RE.housing(e, R, 360)) + '" fill="none" stroke="#1b232c" stroke-width="1.2"/>');
    }
    s.push('<polygon points="' + poly(RE.rotorOutline(e, R, alpha, dm, 40)) + '" fill="#dbe6f1" stroke="#3d5f88" stroke-width="1"/>');
    var c = RE.rotorCenter(e, alpha);
    if (opts.gears) {
      s.push('<circle cx="0" cy="0" r="' + (2 * e) + '" fill="none" stroke="#9a6a1c" stroke-width=".6" stroke-dasharray="2 2"/>');
      s.push('<circle cx="' + RE.fmt(c.x, 2) + '" cy="' + RE.fmt(-c.y, 2) + '" r="' + (3 * e) + '" fill="none" stroke="#3d5f88" stroke-width=".6" stroke-dasharray="2 2"/>');
    }
    s.push('<circle cx="' + RE.fmt(c.x, 2) + '" cy="' + RE.fmt(-c.y, 2) + '" r="' + RE.fmt(Math.max(1.2 * e, 6), 2) + '" fill="#f6d1cc" stroke="#c8433f" stroke-width=".8"/>');
    s.push('<circle cx="0" cy="0" r="' + RE.fmt(Math.max(0.6 * e, 4), 2) + '" fill="#f1dfae" stroke="#9a6a1c" stroke-width=".8"/>');
    s.push('<line x1="0" y1="0" x2="' + RE.fmt(c.x, 2) + '" y2="' + RE.fmt(-c.y, 2) + '" stroke="#c8433f" stroke-width=".8"/>');
    if (opts.extras) s.push(opts.extras);
    s.push("</svg>");
    return s.join("\n");
  };

  global.RE = RE;
})(window);
