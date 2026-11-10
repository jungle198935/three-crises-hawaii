/* ==========================================================================
   Hawaii: Three Crises — chart engine + interactions
   Hand-rolled inline SVG. No libraries, no network, no build step.
   ========================================================================== */
(function () {
  "use strict";

  var DATA = window.DATA;
  if (!DATA) { console.error("dataset.js failed to load"); return; }

  var NS = "http://www.w3.org/2000/svg";
  var C = {
    ocean: "#0d6b74", oceanDeep: "#06414a", oceanSoft: "#6fa8ad",
    coral: "#b8451f", coralSoft: "#d97a52",
    gold: "#a67c1f", goldSoft: "#d4b45c",
    ink: "#10222a", inkSoft: "#4a636e", inkFaint: "#7d949d",
    line: "#d8cfba", paper: "#fbf8f2", paper2: "#f4efe4",
    ok: "#3f7d4e", violet: "#6b5b95"
  };

  /* ---------------- helpers ---------------- */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function fmt(v, d) {
    if (v == null || isNaN(v)) return "–";
    d = d == null ? 0 : d;
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(v, d) { return fmt(v, d == null ? 1 : d) + "%"; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;
    var step = Math.pow(10, Math.floor(Math.log(span / count) / Math.LN10));
    var err = span / count / step;
    if (err >= 7.5) step *= 10;
    else if (err >= 3.5) step *= 5;
    else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    var ticks = [];
    for (var v = lo; v <= hi + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { ticks: ticks, lo: lo, hi: hi, step: step };
  }

  /* ---------------- tooltip ---------------- */
  function makeTip(wrap) {
    var tip = document.createElement("div");
    tip.className = "chart-tip";
    wrap.appendChild(tip);
    return {
      node: tip,
      show: function (html, x, y) {
        tip.innerHTML = html;
        tip.classList.add("is-on");
        var w = tip.offsetWidth, h = tip.offsetHeight;
        var W = wrap.clientWidth;
        var left = clamp(x - w / 2, 4, Math.max(4, W - w - 4));
        var top = y - h - 12;
        if (top < 0) top = y + 16;
        tip.style.left = left + "px";
        tip.style.top = top + "px";
      },
      hide: function () { tip.classList.remove("is-on"); }
    };
  }

  /* ---------------- line chart ----------------
     opts: { series:[{key,label,color,data:{year:val},dash,width}],
             years:[], height, yFmt, yLabel, xLabel, yZero, area, annotations }
  ------------------------------------------------- */
  function lineChart(mount, opts) {
    var wrap = document.createElement("div");
    wrap.className = "chart-wrap";
    mount.appendChild(wrap);
    var tip = makeTip(wrap);

    var years = opts.years.slice().sort(function (a, b) { return a - b; });
    var H = opts.height || 320;
    var PAD = { t: 14, r: 18, b: 40, l: 58 };
    var svg = el("svg", { viewBox: "0 0 " + (opts.vbWidth || 800) + " " + H, role: "img", "aria-label": opts.ariaLabel || "line chart" }, wrap);
    svg.style.height = H + "px";

    var W = opts.vbWidth || 800;
    var iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

    var visible = {};
    opts.series.forEach(function (s) { visible[s.key] = true; });

    function computeDomain() {
      var lo = Infinity, hi = -Infinity;
      opts.series.forEach(function (s) {
        if (!visible[s.key]) return;
        years.forEach(function (y) {
          var v = s.data[y];
          if (v == null || isNaN(v)) return;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        });
      });
      if (opts.annotations) opts.annotations.forEach(function (a) {
        if (a.value != null) { if (a.value < lo) lo = a.value; if (a.value > hi) hi = a.value; }
      });
      if (lo === Infinity) { lo = 0; hi = 1; }
      if (opts.yZero) lo = Math.min(lo, 0);
      var pad = (hi - lo) * 0.08 || 1;
      return niceTicks(lo === hi ? lo - 1 : lo, hi, 5);
    }

    var gRoot = el("g", {}, svg);

    function xOf(y) {
      var i = years.indexOf(y);
      return PAD.l + (years.length === 1 ? iw / 2 : (i / (years.length - 1)) * iw);
    }

    function render() {
      while (gRoot.firstChild) gRoot.removeChild(gRoot.firstChild);
      var dom = computeDomain(), lo = dom.lo, hi = dom.hi;
      function yOf(v) { return PAD.t + ih - ((v - lo) / (hi - lo)) * ih; }

      /* shaded bands marking excluded / non-comparable periods */
      (opts.bands || []).forEach(function (b) {
        var i0 = years.indexOf(b.from), i1 = years.indexOf(b.to);
        if (i0 < 0) return;
        if (i1 < 0) i1 = i0;
        var half = years.length > 1 ? iw / (years.length - 1) / 2 : 20;
        var xa = clamp(xOf(years[i0]) - half, PAD.l, PAD.l + iw);
        var xb = clamp(xOf(years[i1]) + half, PAD.l, PAD.l + iw);
        el("rect", { x: xa, y: PAD.t, width: Math.max(6, xb - xa), height: ih, fill: b.color || "#10222a", opacity: b.opacity == null ? .05 : b.opacity }, gRoot);
        if (b.label) {
          el("text", {
            x: (xa + xb) / 2, y: PAD.t + 13, "text-anchor": "middle",
            fill: C.inkFaint, "font-size": 9, "font-weight": 700,
            "font-family": "ui-sans-serif, system-ui, sans-serif", "letter-spacing": ".04em"
          }, gRoot).textContent = b.label;
        }
      });

      /* gridlines + y labels */
      dom.ticks.forEach(function (t) {
        var y = yOf(t);
        el("line", { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, stroke: C.line, "stroke-width": .7, "stroke-dasharray": t === lo ? "0" : "2 3" }, gRoot);
        el("text", { x: PAD.l - 10, y: y + 3.5, "text-anchor": "end", fill: C.inkFaint, "font-size": 10.5, "font-family": "ui-sans-serif, system-ui, sans-serif" },
          gRoot).textContent = opts.yFmt ? opts.yFmt(t) : fmt(t);
      });

      /* x labels — thin to ~8, and never collide with the final label */
      var every = Math.max(1, Math.ceil(years.length / 9));
      var lastX = xOf(years[years.length - 1]);
      years.forEach(function (y, i) {
        var isLast = i === years.length - 1;
        if (!isLast && i % every !== 0) return;
        var x = xOf(y);
        if (!isLast && lastX - x < 42) return; // too close to the end label
        el("text", { x: x, y: H - PAD.b + 17, "text-anchor": "middle", fill: C.inkFaint, "font-size": 10.5, "font-family": "ui-sans-serif, system-ui, sans-serif" }, gRoot).textContent = y;
      });

      /* annotations (vertical markers) */
      (opts.annotations || []).forEach(function (a) {
        if (a.year == null || years.indexOf(a.year) < 0) return;
        var x = xOf(a.year);
        el("line", { x1: x, x2: x, y1: PAD.t, y2: PAD.t + ih, stroke: a.color || C.coral, "stroke-width": 1, "stroke-dasharray": "3 3", opacity: .55 }, gRoot);
        if (a.label) {
          var t = el("text", { x: x + 4, y: PAD.t + 11, fill: a.color || C.coral, "font-size": 9.5, "font-weight": 700, "font-family": "ui-sans-serif, system-ui, sans-serif" }, gRoot);
          t.textContent = a.label;
        }
      });

      /* series — build segments so nulls break the line instead of bridging a gap */
      opts.series.forEach(function (s) {
        if (!visible[s.key]) return;
        var segs = [], cur = [];
        years.forEach(function (y) {
          var v = s.data[y];
          if (v == null || isNaN(v)) { if (cur.length) { segs.push(cur); cur = []; } return; }
          cur.push({ y: y, v: v, x: xOf(y), yy: yOf(v) });
        });
        if (cur.length) segs.push(cur);
        var all = [];
        segs.forEach(function (sg) { all = all.concat(sg); });
        if (!all.length) return;

        if (opts.area) {
          segs.forEach(function (sg) {
            var dA = "M " + sg[0].x + " " + (PAD.t + ih);
            sg.forEach(function (p) { dA += " L " + p.x + " " + p.yy; });
            dA += " L " + sg[sg.length - 1].x + " " + (PAD.t + ih) + " Z";
            var gid = "g-" + s.key + "-" + Math.round(sg[0].x);
            var grad = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, el("defs", {}, gRoot));
            el("stop", { offset: "0%", "stop-color": s.color, "stop-opacity": .26 }, grad);
            el("stop", { offset: "100%", "stop-color": s.color, "stop-opacity": .02 }, grad);
            el("path", { d: dA, fill: "url(#" + gid + ")" }, gRoot);
          });
        }

        var lastPath = null;
        segs.forEach(function (sg) {
          var d = "";
          sg.forEach(function (p, i) { d += (i ? " L " : "M ") + p.x + " " + p.yy; });
          lastPath = el("path", {
            d: d, fill: "none", stroke: s.color, "stroke-width": s.width || 2.25,
            "stroke-linejoin": "round", "stroke-linecap": "round",
            "stroke-dasharray": s.dash || "none"
          }, gRoot);
        });
        if (lastPath && lastPath.getTotalLength && !opts.noAnim) {
          var len = lastPath.getTotalLength();
          lastPath.style.strokeDasharray = len + " " + len;
          lastPath.style.strokeDashoffset = len;
          lastPath.style.transition = "stroke-dashoffset .9s cubic-bezier(.3,.8,.3,1)";
          requestAnimationFrame(function () { lastPath.style.strokeDashoffset = 0; });
        }
        s._pts = all;
      });

      /* hover layer */
      var hover = el("g", { opacity: 0 }, gRoot);
      var vline = el("line", { y1: PAD.t, y2: PAD.t + ih, stroke: C.inkFaint, "stroke-width": 1, "stroke-dasharray": "2 2" }, hover);
      var dots = opts.series.map(function (s) {
        return el("circle", { r: 4, fill: s.color, stroke: C.paper, "stroke-width": 2 }, hover);
      });
      var hit = el("rect", { x: PAD.l, y: PAD.t, width: iw, height: ih, fill: "transparent", style: "cursor:crosshair" }, gRoot);

      function onMove(ev) {
        var box = svg.getBoundingClientRect();
        var px = (ev.clientX - box.left) / box.width * W;
        var idx = Math.round((px - PAD.l) / (iw / Math.max(1, years.length - 1)));
        idx = clamp(idx, 0, years.length - 1);
        var yr = years[idx], x = xOf(yr);
        hover.setAttribute("opacity", 1);
        vline.setAttribute("x1", x); vline.setAttribute("x2", x);
        var rows = [];
        opts.series.forEach(function (s, i) {
          var v = s.data[yr];
          var c = dots[i];
          if (visible[s.key] && v != null && !isNaN(v)) {
            c.setAttribute("cx", x); c.setAttribute("cy", yOf(v)); c.setAttribute("opacity", 1);
            rows.push('<div><span class="tip-k">' + s.label + ':</span> <b>' + (opts.yFmt ? opts.yFmt(v) : fmt(v)) + "</b></div>");
          } else { c.setAttribute("opacity", 0); }
        });
        tip.show('<div style="font-weight:700;margin-bottom:.2rem">' + (opts.xPrefix || "") + yr + "</div>" + rows.join(""),
          (x / W) * box.width, (yOf(opts.series[0].data[yr] != null ? opts.series[0].data[yr] : lo) / H) * box.height);
      }
      hit.addEventListener("mousemove", onMove);
      hit.addEventListener("mouseenter", onMove);
      hit.addEventListener("mouseleave", function () { hover.setAttribute("opacity", 0); tip.hide(); });
      hit.addEventListener("touchmove", function (e) { if (e.touches[0]) onMove(e.touches[0]); }, { passive: true });
    }

    render();

    /* legend */
    if (opts.series.length > 1 && opts.legend !== false) {
      var lg = document.createElement("div");
      lg.className = "legend";
      opts.series.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "legend-item";
        b.innerHTML = '<span class="sw" style="background:' + s.color + '"></span>' + s.label;
        b.addEventListener("click", function () {
          var on = visible[s.key];
          if (on && Object.keys(visible).filter(function (k) { return visible[k]; }).length === 1) return;
          visible[s.key] = !on;
          b.classList.toggle("is-off", on);
          render();
        });
        lg.appendChild(b);
      });
      mount.appendChild(lg);
    }
    return { render: render };
  }


  /* ---------------- stacked area chart ----------------
     Draws cumulative bands so each component is visible even when one
     dominates the total. The envelope equals the sum of the series.
  ----------------------------------------------------- */
  function stackedArea(mount, opts) {
    var wrap = document.createElement("div");
    wrap.className = "chart-wrap";
    mount.appendChild(wrap);
    var tip = makeTip(wrap);

    var years = opts.years.slice().sort(function (a, b) { return a - b; });
    var H = opts.height || 330, PAD = { t: 14, r: 18, b: 40, l: 58 };
    var W = opts.vbWidth || 800, iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.ariaLabel || "stacked area chart" }, wrap);
    svg.style.height = H + "px";

    function xOf(y) {
      var i = years.indexOf(y);
      return PAD.l + (years.length === 1 ? iw / 2 : (i / (years.length - 1)) * iw);
    }
    // cumulative totals per year
    var totals = {};
    years.forEach(function (y) {
      var t = 0;
      opts.series.forEach(function (s) { var v = s.data[y]; if (v != null && !isNaN(v)) t += v; });
      totals[y] = t;
    });
    var maxT = Math.max.apply(null, years.map(function (y) { return totals[y] || 0; }));
    var dom = niceTicks(0, maxT, 5);
    function yOf(v) { return PAD.t + ih - (v / dom.hi) * ih; }

    dom.ticks.forEach(function (t) {
      var y = yOf(t);
      el("line", { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, stroke: C.line, "stroke-width": .7, "stroke-dasharray": t === 0 ? "0" : "2 3" }, svg);
      el("text", { x: PAD.l - 10, y: y + 3.5, "text-anchor": "end", fill: C.inkFaint, "font-size": 10.5, "font-family": "ui-sans-serif, system-ui, sans-serif" }, svg).textContent = fmt(t);
    });
    var every = Math.max(1, Math.ceil(years.length / 9));
    var lastX = xOf(years[years.length - 1]);
    years.forEach(function (y, i) {
      var isLast = i === years.length - 1;
      if (!isLast && i % every !== 0) return;
      var x = xOf(y);
      if (!isLast && lastX - x < 42) return;
      el("text", { x: x, y: H - PAD.b + 17, "text-anchor": "middle", fill: C.inkFaint, "font-size": 10.5, "font-family": "ui-sans-serif, system-ui, sans-serif" }, svg).textContent = y;
    });

    // draw bands from the outside in
    var base = {};
    years.forEach(function (y) { base[y] = 0; });
    opts.series.forEach(function (s) {
      var top = {}, bot = {};
      years.forEach(function (y) {
        var v = s.data[y];
        if (v == null || isNaN(v)) return;
        bot[y] = base[y];
        top[y] = base[y] + v;
        base[y] = top[y];
      });
      var yv = years.filter(function (y) { return top[y] != null; });
      if (!yv.length) return;
      var d = "M " + xOf(yv[0]) + " " + yOf(bot[yv[0]]);
      yv.forEach(function (y) { d += " L " + xOf(y) + " " + yOf(top[y]); });
      for (var i = yv.length - 1; i >= 0; i--) d += " L " + xOf(yv[i]) + " " + yOf(bot[yv[i]]);
      d += " Z";
      var pth = el("path", { d: d, fill: s.color, "fill-opacity": .82, stroke: s.color, "stroke-width": 1 }, svg);
      if (!opts.noAnim) { pth.style.opacity = 0; pth.style.transition = "opacity .6s ease"; requestAnimationFrame(function () { pth.style.opacity = 1; }); }
    });

    // envelope line = the total
    var env = "";
    years.forEach(function (y, i) { var t = totals[y]; if (!t) return; env += (env ? " L " : "M ") + xOf(y) + " " + yOf(t); });
    el("path", { d: env, fill: "none", stroke: C.ink, "stroke-width": 1.6, "stroke-opacity": .55, "stroke-linejoin": "round" }, svg);

    // hover
    var hover = el("g", { opacity: 0 }, svg);
    var vline = el("line", { y1: PAD.t, y2: PAD.t + ih, stroke: C.ink, "stroke-width": 1, "stroke-dasharray": "2 2" }, hover);
    var dots = [];
    years.forEach(function () { dots.push(el("circle", { r: 3.5, stroke: C.paper, "stroke-width": 1.5, fill: C.ink }, hover)); });
    var hit = el("rect", { x: PAD.l, y: PAD.t, width: iw, height: ih, fill: "transparent", style: "cursor:crosshair" }, svg);

    function onMove(ev) {
      var box = svg.getBoundingClientRect();
      var px = (ev.clientX - box.left) / box.width * W;
      var idx = Math.round((px - PAD.l) / (iw / Math.max(1, years.length - 1)));
      idx = clamp(idx, 0, years.length - 1);
      var y = years[idx], x = xOf(y);
      hover.setAttribute("opacity", 1);
      vline.setAttribute("x1", x); vline.setAttribute("x2", x);
      var acc = 0, rows = [];
      opts.series.forEach(function (s, i) {
        var v = s.data[y];
        if (v == null || isNaN(v)) { dots[i].setAttribute("opacity", 0); return; }
        acc += v;
        dots[i].setAttribute("cx", x); dots[i].setAttribute("cy", yOf(acc)); dots[i].setAttribute("opacity", 1);
        dots[i].setAttribute("fill", s.color);
        rows.push('<div><span class="tip-k">' + s.label + ':</span> <b>' + fmt(v) + '</b></div>');
      });
      rows.push('<div style="border-top:1px solid rgba(255,255,255,.25);margin-top:.25rem;padding-top:.25rem"><span class="tip-k">Total index:</span> <b>' + fmt(totals[y]) + "</b></div>");
      tip.show('<div style="font-weight:700;margin-bottom:.2rem">' + y + "</div>" + rows.join(""),
        (x / W) * box.width, (yOf(totals[y]) / H) * box.height);
    }
    hit.addEventListener("mousemove", onMove);
    hit.addEventListener("mouseenter", onMove);
    hit.addEventListener("mouseleave", function () { hover.setAttribute("opacity", 0); tip.hide(); });
    hit.addEventListener("touchmove", function (e) { if (e.touches[0]) onMove(e.touches[0]); }, { passive: true });

    // legend
    var lg = document.createElement("div");
    lg.className = "legend";
    opts.series.forEach(function (s) {
      var d = document.createElement("span");
      d.className = "legend-item";
      d.innerHTML = '<span class="sw" style="background:' + s.color + '"></span>' + s.label;
      lg.appendChild(d);
    });
    var tot = document.createElement("span");
    tot.className = "legend-item";
    tot.innerHTML = '<span class="sw" style="background:' + C.ink + ';opacity:.55"></span>Total (sum)';
    lg.appendChild(tot);
    mount.appendChild(lg);
  }

  /* ---------------- bar chart (single series) ---------------- */
  function barChart(mount, opts) {
    var wrap = document.createElement("div");
    wrap.className = "chart-wrap";
    mount.appendChild(wrap);
    var tip = makeTip(wrap);
    var rows = opts.rows; // [{label, value, color}]
    var H = opts.height || 260;
    var PAD = { t: 12, r: 14, b: 52, l: 58 };
    var W = opts.vbWidth || 800;
    var iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": opts.ariaLabel || "bar chart" }, wrap);
    svg.style.height = H + "px";
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    var dom = niceTicks(0, max, 4);
    function yOf(v) { return PAD.t + ih - (v / dom.hi) * ih; }
    dom.ticks.forEach(function (t) {
      var y = yOf(t);
      el("line", { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, stroke: C.line, "stroke-width": .7, "stroke-dasharray": t === 0 ? "0" : "2 3" }, svg);
      el("text", { x: PAD.l - 9, y: y + 3.5, "text-anchor": "end", fill: C.inkFaint, "font-size": 10.5, "font-family": "ui-sans-serif, system-ui, sans-serif" }, svg).textContent = opts.yFmt ? opts.yFmt(t) : fmt(t);
    });
    var bw = Math.min(56, (iw / rows.length) * 0.62);
    rows.forEach(function (r, i) {
      var cx = PAD.l + (iw / rows.length) * (i + 0.5);
      var y = yOf(r.value), h = PAD.t + ih - y;
      var rect = el("rect", {
        x: cx - bw / 2, y: PAD.t + ih, width: bw, height: 0, rx: 3,
        fill: r.color || C.ocean
      }, svg);
      if (!opts.noAnim) {
        rect.style.transition = "y .7s cubic-bezier(.3,.8,.3,1) " + (i * 45) + "ms, height .7s cubic-bezier(.3,.8,.3,1) " + (i * 45) + "ms";
        requestAnimationFrame(function () { rect.setAttribute("y", y); rect.setAttribute("height", h); });
      } else { rect.setAttribute("y", y); rect.setAttribute("height", h); }
      el("text", { x: cx, y: H - PAD.b + 18, "text-anchor": "middle", fill: C.inkSoft, "font-size": 10.5, "font-weight": 600, "font-family": "ui-sans-serif, system-ui, sans-serif" }, svg).textContent = r.label;
      if (r.sub) el("text", { x: cx, y: H - PAD.b + 33, "text-anchor": "middle", fill: C.inkFaint, "font-size": 9.5, "font-family": "ui-sans-serif, system-ui, sans-serif" }, svg).textContent = r.sub;
      var hit = el("rect", { x: cx - (iw / rows.length) / 2, y: PAD.t, width: iw / rows.length, height: ih, fill: "transparent", style: "cursor:pointer" }, svg);
      hit.addEventListener("mouseenter", function () {
        var box = svg.getBoundingClientRect();
        tip.show("<b>" + r.label + "</b><div>" + (opts.yFmt ? opts.yFmt(r.value) : fmt(r.value)) + "</div>" +
          (r.note ? '<div class="tip-k" style="max-width:220px;white-space:normal">' + r.note + "</div>" : ""),
          (cx / W) * box.width, (y / H) * box.height);
      });
      hit.addEventListener("mouseleave", function () { tip.hide(); });
    });
  }

  /* ---------------- horizontal bars ---------------- */
  function hBar(mount, opts) {
    var rows = opts.rows;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    var list = document.createElement("div");
    list.style.cssText = "display:grid;gap:.55rem";
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:minmax(96px,140px) 1fr auto;gap:.7rem;align-items:center;font-size:.82rem";
      var lab = document.createElement("span");
      lab.textContent = r.label;
      lab.style.cssText = "color:var(--ink-soft);font-weight:600";
      var track = document.createElement("div");
      track.style.cssText = "background:var(--paper-3);border-radius:99px;height:9px;overflow:hidden";
      var fill = document.createElement("div");
      var w = Math.max(1.5, (r.value / max) * 100);
      fill.style.cssText = "height:100%;width:0;border-radius:99px;background:" + (r.color || C.ocean) + ";transition:width .8s cubic-bezier(.3,.8,.3,1)";
      track.appendChild(fill);
      var val = document.createElement("span");
      val.textContent = opts.fmt ? opts.fmt(r.value) : fmt(r.value);
      val.style.cssText = "font-variant-numeric:tabular-nums;font-weight:700;color:var(--ink)";
      row.append(lab, track, val);
      list.appendChild(row);
      requestAnimationFrame(function () { fill.style.width = w + "%"; });
    });
    mount.appendChild(list);
  }

  /* ==========================================================================
     SERIES PREP
     ========================================================================== */
  var HOM = DATA.homeless.series;
  var homYears = Object.keys(HOM).map(Number).sort(function (a, b) { return a - b; });
  // count-type lookup so we can mark non-comparable years
  var homType = {};
  homYears.forEach(function (y) { homType[y] = (HOM[y].count_types || []).join(", "); });

  function homSeries(field, comparableOnly) {
    var o = {};
    homYears.forEach(function (y) {
      var r = HOM[y];
      // sheltered-only years measure a different population: emit null so the line breaks
      if (comparableOnly && /Sheltered-Only/.test(homType[y] || "")) { o[y] = null; return; }
      o[y] = r[field] != null ? r[field] : null;
    });
    return o;
  }

  var CR = DATA.crime;
  var crYears = CR.years;
  function crimeSeries(field) { return CR.state[field] || {}; }

  var PR = DATA.prison;
  var prYearsA = PR.assigned.map(function (r) { return r.year; });
  function prSeries(field) {
    var o = {};
    PR.assigned.forEach(function (r) { o[r.year] = r[field]; });
    return o;
  }

  /* ==========================================================================
     MOUNT CHARTS
     ========================================================================== */
  function $(id) { return document.getElementById(id); }

  /* ==========================================================================
     REVEAL + NAV — set up first, so no later chart error can blank the page.
     ========================================================================== */
  (function setupReveal() {
    var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    function showAll() { revealEls.forEach(function (n) { n.classList.add("is-in"); }); }

    if ("IntersectionObserver" in window) {
      try {
        var ro = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { e.target.classList.add("is-in"); ro.unobserve(e.target); }
          });
        }, { rootMargin: "0px 0px -6% 0px", threshold: .04 });
        revealEls.forEach(function (n) { ro.observe(n); });
        // Failsafe: anything still hidden after 2.5s becomes visible regardless.
        setTimeout(function () {
          revealEls.forEach(function (n) { if (!n.classList.contains("is-in")) n.classList.add("is-in"); });
        }, 2500);
      } catch (err) { showAll(); }
    } else { showAll(); }

    // Reveal whatever is already on screen at load, without waiting.
    requestAnimationFrame(function () {
      var vh = window.innerHeight || 800;
      revealEls.forEach(function (n) {
        if (n.getBoundingClientRect().top < vh * 0.92) n.classList.add("is-in");
      });
    });

    // Active-section highlighting
    var links = Array.prototype.slice.call(document.querySelectorAll(".nav a[href^='#']"));
    var secs = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
    if ("IntersectionObserver" in window && secs.length) {
      try {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            links.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id); });
          });
        }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
        secs.forEach(function (s) { io.observe(s); });
      } catch (err) { /* non-critical */ }
    }
  })();

  /* --- Hero / overview: the diverging trio --- */
  var heroMount = $("chart-hero");
  if (heroMount) {
    // index each series to its first available year = 100
    function indexSeries(data, years) {
      var first = null;
      years.forEach(function (y) { if (first === null && data[y] != null) first = data[y]; });
      var o = {};
      years.forEach(function (y) { if (data[y] != null && first) o[y] = (data[y] / first) * 100; });
      return o;
    }
    var bash = prSeries("total");
    var bhom = homSeries("total", true);
    var bcr = {};
    crYears.forEach(function (y) { if (CR.rates_state["Total Index"] && CR.rates_state["Total Index"][y] != null) bcr[y] = CR.rates_state["Total Index"][y]; });
    var allYears = Array.from(new Set([].concat(
      Object.keys(bash).map(Number), Object.keys(bhom).map(Number), Object.keys(bcr).map(Number)
    ))).sort(function (a, b) { return a - b; });
    lineChart(heroMount, {
      ariaLabel: "Indexed trend of homicides, homelessness and crime index, 1997 to 2025",
      years: allYears,
      height: 360,
      yFmt: function (v) { return fmt(v) + ""; },
      series: [
        { key: "pr", label: "Prison population", color: C.ocean, data: indexSeries(bash, allYears), width: 2.6 },
        { key: "hm", label: "Homeless count (full years)", color: C.coral, data: indexSeries(bhom, allYears), width: 2.6 },
        { key: "cr", label: "Crime rate", color: C.gold, data: indexSeries(bcr, allYears), width: 2.6, dash: "5 3" }
      ]
    });
  }

  /* --- Homelessness --- */
  var h1 = $("chart-homeless");
  if (h1) {
    lineChart(h1, {
      ariaLabel: "Hawaii homeless population, sheltered and unsheltered, 2007 to 2025, excluding sheltered-only years",
      years: homYears, height: 330, area: true, yZero: true,
      bands: [{ from: 2021, to: 2021, label: "NO STREET COUNT" }, { from: 2025, to: 2025, label: "NO STREET COUNT" }],
      series: [
        { key: "tot", label: "Total homeless", color: C.coral, data: homSeries("total", true) },
        { key: "uns", label: "Unsheltered", color: C.gold, data: homSeries("unsheltered", true) },
        { key: "she", label: "Sheltered", color: C.ocean, data: homSeries("sheltered", true) }
      ]
    });
  }

  var h2 = $("chart-homeless-sub");
  if (h2) {
    lineChart(h2, {
      ariaLabel: "Chronically homeless, Native Hawaiian homeless, and veteran homeless in Hawaii",
      years: homYears, height: 340, vbWidth: 600, yZero: true,
      bands: [{ from: 2021, to: 2021, label: "NO STREET COUNT" }, { from: 2025, to: 2025, label: "NO STREET COUNT" }],
      series: [
        { key: "nh", label: "Native Hawaiian / Pacific Islander", color: C.coral, data: homSeries("nhopi", true) },
        { key: "ch", label: "Chronically homeless", color: C.violet, data: homSeries("chronic", true) },
        { key: "vt", label: "Veterans", color: C.ocean, data: homSeries("veterans", true) }
      ]
    });
  }

  /* --- Crime --- */
  var c1 = $("chart-crime");
  if (c1) {
    stackedArea(c1, {
      ariaLabel: "Hawaii index crime rate per 100000 residents decomposed into property and violent crime, 1975 to 2021",
      years: crYears, height: 340,
      series: [
        { key: "prop", label: "Property crime", color: C.ocean, data: CR.rates_state["Property Crime Index"] },
        { key: "vio", label: "Violent crime", color: C.coral, data: CR.rates_state["Violent Crime Index"] }
      ]
    });
  }

  var c1b = $("chart-crime-violent");
  if (c1b) {
    lineChart(c1b, {
      ariaLabel: "Hawaii violent crime rate per 100000 residents, 1975 to 2021",
      years: crYears, height: 300, area: true, yZero: true,
      series: [
        { key: "vio", label: "Violent crime rate", color: C.coral, data: CR.rates_state["Violent Crime Index"] }
      ]
    });
  }

  var c2 = $("chart-crime-county");
  if (c2) {
    var countyColors = { "City & County of Honolulu": C.ocean, "Hawaii County": C.coral, "Maui County": C.gold, "Kauai County": C.violet };
    var cSeries = Object.keys(CR.rates_counties).filter(function (c) { return c !== "State"; }).map(function (c) {
      return {
        key: c,
        label: c.replace("City & County of ", "").replace(" County", ""),
        color: countyColors[c],
        data: CR.rates_counties[c]["Total Index"]
      };
    });
    lineChart(c2, {
      ariaLabel: "Index crime rate per 100000 residents by Hawaii county, 1975 to 2021",
      years: crYears, height: 330, vbWidth: 560, series: cSeries
    });
  }
  var c3 = $("chart-crime-anatomy");
  if (c3) {
    var last = crYears[crYears.length - 1];
    var types = [
      ["Larceny-Theft", C.oceanSoft], ["Burglary", C.ocean], ["Motor Vehicle Theft", C.gold],
      ["Assault", C.coralSoft], ["Robbery", C.coral], ["Murder", C.ink]
    ];
    barChart(c3, {
      ariaLabel: "Index offenses by type in Hawaii, " + last,
      height: 300, vbWidth: 560,
      rows: types.map(function (t) {
        return { label: t[0].replace("Larceny-Theft", "Larceny"), sub: "", value: CR.state[t[0]] ? CR.state[t[0]][last] : 0, color: t[1] };
      }),
      yFmt: function (v) { return fmt(v); }
    });
  }

  /* --- Incarceration --- */
  var p1 = $("chart-prison");
  if (p1) {
    lineChart(p1, {
      ariaLabel: "Hawaii total assigned inmate population and mainland-contracted population, 1997 to 2025",
      years: prYearsA, height: 330, area: true, yZero: true,
      series: [
        { key: "tot", label: "Total assigned population", color: C.ocean, data: prSeries("total") },
        { key: "con", label: "Housed out of state", color: C.coral, data: prSeries("contracted") }
      ],
      annotations: [{ year: 2009, label: "2009 peak: 34.6% out of state", color: C.coral }]
    });
  }
  // hoisted to function scope so later charts can reuse it
  var INF = PR.in_facility;
  var infYears = INF.map(function (r) { return r.year; });
  function infS(f) { var o = {}; INF.forEach(function (r) { o[r.year] = r[f]; }); return o; }

  var p2 = $("chart-prison-composition");
  if (p2) {
    var iy = infYears;
    lineChart(p2, {
      ariaLabel: "Composition of Hawaii in-facility inmate population 2010 to 2025",
      years: iy, height: 300, yZero: true,
      series: [
        { key: "ns", label: "Not sentenced (pretrial)", color: C.coral, data: infS("not_sentenced") },
        { key: "sf", label: "Sentenced felons", color: C.ocean, data: infS("sentenced_felons") },
        { key: "tv", label: "Technical violators", color: C.gold, data: infS("technical_violators") },
        { key: "sj", label: "Sentenced to jail", color: C.oceanSoft, data: infS("sentenced_jail") }
      ]
    });
  }

  /* --- Small multiples: each measure on its own axis, 2010–2021 --- */
  var yrs = [], homRate = {}, crRate = {}, prRate = {};
  for (var y = 2010; y <= 2020; y++) {
    var pop = CR.population_state[y];
    if (!pop) continue;
    yrs.push(y);
    if (HOM[y] && HOM[y].total != null) homRate[y] = (HOM[y].total / pop) * 100000;
    if (CR.rates_state["Total Index"][y] != null) crRate[y] = CR.rates_state["Total Index"][y];
    var infY = null;
    INF.forEach(function (r) { if (r.year === y) infY = r.total; });
    if (infY != null) prRate[y] = (infY / pop) * 100000;
  }
  function mini(mountId, label, color, data, fmtFn) {
    var m = $(mountId);
    if (!m) return;
    lineChart(m, {
      ariaLabel: label + " per 100000 Hawaii residents, 2010 to 2020",
      years: yrs, height: 220, vbWidth: 300, area: true, yZero: true, legend: false,
      series: [{ key: mountId, label: label, color: color, data: data }],
      yFmt: fmtFn || function (v) { return fmt(v); }
    });
  }
  mini("chart-mm-homeless", "Homeless rate", C.coral, homRate);
  mini("chart-mm-crime", "Crime rate", C.gold, crRate);
  mini("chart-mm-prison", "Incarceration rate", C.ocean, prRate);

  /* ==========================================================================
     SMALL NUMERIC WIDGETS
     ========================================================================== */
  // Homeless composition by type for latest full year
  var compMount = $("bars-homeless-comp");
  if (compMount) {
    var yl = 2024;
    var r = HOM[yl];
    hBar(compMount, {
      rows: [
        { label: "Individuals", value: r.individuals, color: C.ocean },
        { label: "In families", value: r.families, color: C.oceanSoft },
        { label: "Chronically homeless", value: r.chronic, color: C.violet },
        { label: "Native Hawaiian / PI", value: r.nhopi, color: C.coral },
        { label: "Veterans", value: r.veterans, color: C.gold }
      ],
      fmt: function (v) { return fmt(v); }
    });
  }

  // County comparison, latest UCR year — raw offense counts
  var countyMount = $("bars-county");
  if (countyMount) {
    var yl2 = 2021;
    var rowsC = Object.keys(CR.counties).map(function (c) {
      var n = CR.counties[c]["Total Index"][yl2] || 0;
      return {
        label: c.replace("City & County of ", "").replace(" County", ""),
        value: n,
        color: C.ocean
      };
    }).sort(function (a, b) { return b.value - a.value; });
    hBar(countyMount, { rows: rowsC, fmt: function (v) { return fmt(v) + " offenses"; } });
  }


  /* ==========================================================================
     SMALL MULTIPLES — one panel per offence category, own scale each
     ========================================================================== */
  (function smallMultiples() {
    var grid = $("sm-grid");
    if (!grid) return;

    // [count key, rate key, display label, colour]
    var CATS = [
      ["Murder", "Murder", "Murder", C.ink],
      ["Rape (legacy)*", "Rape (legacy)", "Rape (legacy definition)", C.violet],
      ["Robbery", "Robbery", "Robbery", C.coral],
      ["Assault", "Assault", "Aggravated assault", C.coralSoft],
      ["Burglary", "Burglary", "Burglary", C.ocean],
      ["Larceny-Theft", "Larceny-Theft", "Larceny-theft", C.oceanSoft],
      ["Motor Vehicle Theft", "Motor Vehicle Theft", "Motor vehicle theft", C.gold],
      ["Arson", "Arson", "Arson", C.goldSoft]
    ];
    var mode = "rate"; // "rate" | "count"

    function seriesFor(cat) {
      var src = mode === "rate" ? CR.rates_state[cat[1]] : CR.state[cat[0]];
      var o = {};
      if (!src) return o;
      Object.keys(src).forEach(function (y) {
        var v = src[y];
        if (v != null && !isNaN(v)) o[parseInt(y, 10)] = v;
      });
      return o;
    }

    function drawCell(cell, cat) {
      while (cell.firstChild) cell.removeChild(cell.firstChild);
      var data = seriesFor(cat);
      var yrs = Object.keys(data).map(Number).sort(function (a, b) { return a - b; });
      if (!yrs.length) return;
      var first = data[yrs[0]], last = data[yrs[yrs.length - 1]];
      var firstY = yrs[0], lastY = yrs[yrs.length - 1];
      var delta = first ? ((last / first) - 1) * 100 : 0;

      var head = document.createElement("div");
      head.className = "sm-head";
      var t = document.createElement("span");
      t.className = "sm-title"; t.textContent = cat[2];
      var d = document.createElement("span");
      d.className = "sm-delta " + (delta > 4 ? "up" : delta < -4 ? "down" : "flat");
      d.textContent = (delta > 0 ? "+" : delta < 0 ? "−" : "±") + Math.abs(delta).toFixed(0) + "%";
      d.title = "Change from " + firstY + " to " + lastY;
      head.appendChild(t); head.appendChild(d);
      cell.appendChild(head);

      var val = document.createElement("div");
      val.className = "sm-val";
      val.innerHTML = "<b>" + fmt(last) + "</b> " + (mode === "rate" ? "per 100k" : "offenses") +
        " <span style='opacity:.7'>· " + lastY + "</span>";
      cell.appendChild(val);

      var mount = document.createElement("div");
      mount.className = "sm-chart";
      cell.appendChild(mount);
      miniSeries(mount, data, cat[3]);
    }

    /* compact sparkline with its own scale + hover */
    function miniSeries(mount, data, color) {
      var wrap = document.createElement("div");
      wrap.className = "chart-wrap";
      mount.appendChild(wrap);
      var tip = makeTip(wrap);

      var yrs = Object.keys(data).map(Number).sort(function (a, b) { return a - b; });
      var vals = yrs.map(function (y) { return data[y]; });
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      if (lo === hi) { lo -= 1; hi += 1; }
      var pad = (hi - lo) * 0.12; lo = Math.max(0, lo - pad); hi = hi + pad;

      var W = 300, H = 92, P = { t: 6, r: 4, b: 14, l: 4 };
      var iw = W - P.l - P.r, ih = H - P.t - P.b;
      var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Trend over time" }, wrap);
      svg.style.height = "92px";

      function xOf(i) { return P.l + (yrs.length === 1 ? iw / 2 : (i / (yrs.length - 1)) * iw); }
      function yOf(v) { return P.t + ih - ((v - lo) / (hi - lo)) * ih; }

      // baseline
      el("line", { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, stroke: C.line, "stroke-width": .8 }, svg);

      // area
      var gid = "smg-" + Math.random().toString(36).slice(2, 8);
      var grad = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, el("defs", {}, svg));
      el("stop", { offset: "0%", "stop-color": color, "stop-opacity": .28 }, grad);
      el("stop", { offset: "100%", "stop-color": color, "stop-opacity": .02 }, grad);
      var dA = "M " + xOf(0) + " " + (P.t + ih);
      yrs.forEach(function (y, i) { dA += " L " + xOf(i) + " " + yOf(data[y]); });
      dA += " L " + xOf(yrs.length - 1) + " " + (P.t + ih) + " Z";
      el("path", { d: dA, fill: "url(#" + gid + ")" }, svg);

      var d = "";
      yrs.forEach(function (y, i) { d += (i ? " L " : "M ") + xOf(i) + " " + yOf(data[y]); });
      el("path", { d: d, fill: "none", stroke: color, "stroke-width": 1.9,
        "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

      // first / last year labels
      el("text", { x: P.l, y: H - 3, "text-anchor": "start", fill: C.inkFaint, "font-size": 8.5,
        "font-family": "ui-sans-serif, system-ui, sans-serif" }, svg).textContent = yrs[0];
      el("text", { x: W - P.r, y: H - 3, "text-anchor": "end", fill: C.inkFaint, "font-size": 8.5,
        "font-family": "ui-sans-serif, system-ui, sans-serif" }, svg).textContent = yrs[yrs.length - 1];

      // hover
      var hover = el("g", { opacity: 0 }, svg);
      var vl = el("line", { y1: P.t, y2: P.t + ih, stroke: C.ink, "stroke-width": .9, "stroke-dasharray": "2 2" }, hover);
      var dot = el("circle", { r: 3, fill: color, stroke: C.paper, "stroke-width": 1.5 }, hover);
      var hit = el("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent", style: "cursor:crosshair" }, svg);
      function onMove(ev) {
        var box = svg.getBoundingClientRect();
        var px = (ev.clientX - box.left) / box.width * W;
        var i = Math.round((px - P.l) / (iw / Math.max(1, yrs.length - 1)));
        i = clamp(i, 0, yrs.length - 1);
        var y = yrs[i], v = data[y], x = xOf(i);
        hover.setAttribute("opacity", 1);
        vl.setAttribute("x1", x); vl.setAttribute("x2", x);
        dot.setAttribute("cx", x); dot.setAttribute("cy", yOf(v));
        tip.show("<b>" + y + "</b> · " + fmt(v), (x / W) * box.width, (yOf(v) / H) * box.height);
      }
      hit.addEventListener("mousemove", onMove);
      hit.addEventListener("mouseenter", onMove);
      hit.addEventListener("mouseleave", function () { hover.setAttribute("opacity", 0); tip.hide(); });
      hit.addEventListener("touchmove", function (e) { if (e.touches[0]) onMove(e.touches[0]); }, { passive: true });
    }

    var cells = CATS.map(function (cat) {
      var cell = document.createElement("div");
      cell.className = "sm-cell";
      grid.appendChild(cell);
      drawCell(cell, cat);
      return { cell: cell, cat: cat };
    });

    function setMode(next) {
      if (next === mode) return;
      mode = next;
      $("seg-rate").setAttribute("aria-pressed", mode === "rate" ? "true" : "false");
      $("seg-count").setAttribute("aria-pressed", mode === "count" ? "true" : "false");
      cells.forEach(function (c) { drawCell(c.cell, c.cat); });
    }
    var sr = $("seg-rate"), sc = $("seg-count");
    if (sr) sr.addEventListener("click", function () { setMode("rate"); });
    if (sc) sc.addEventListener("click", function () { setMode("count"); });
  })();

  /* ==========================================================================
     TABLES
     ========================================================================== */
  var tbody = $("tbody-homeless");
  if (tbody) {
    homYears.slice().reverse().forEach(function (y) {
      var r = HOM[y];
      var tr = document.createElement("tr");
      var isPartial = /Sheltered-Only/.test(homType[y] || "");
      tr.innerHTML =
        "<td>" + y + (isPartial ? ' <span class="tag">sheltered only</span>' : "") + "</td>" +
        '<td class="num">' + fmt(r.total) + "</td>" +
        '<td class="num">' + fmt(r.sheltered) + "</td>" +
        '<td class="num">' + fmt(r.unsheltered) + "</td>" +
        '<td class="num">' + fmt(r.nhopi) + "</td>" +
        '<td class="num">' + fmt(r.chronic) + "</td>";
      tbody.appendChild(tr);
    });
  }

  var tbodyP = $("tbody-prison");
  if (tbodyP) {
    PR.assigned.slice().reverse().forEach(function (r) {
      var tr = document.createElement("tr");
      var share = r.total ? (r.contracted / r.total) * 100 : 0;
      tr.innerHTML = "<td>FY" + r.year + '</td><td class="num">' + fmt(r.total) + '</td><td class="num">' + fmt(r.contracted) +
        '</td><td class="num">' + pct(share) + "</td>";
      tbodyP.appendChild(tr);
    });
  }

  /* ==========================================================================
     "LIVE" derivative numbers used in prose
     ========================================================================== */
  function setText(id, txt) { var n = $(id); if (n) n.textContent = txt; }
  // prison peak year is FY2005 (6,092 total); out-of-state peak is FY2009
  var pPeak = PR.assigned.filter(function (r) { return r.year === 2005; })[0];
  var pMax = PR.assigned.filter(function (r) { return r.year === 2009; })[0];
  var p2025 = PR.assigned.filter(function (r) { return r.year === 2025; })[0];
  if (pPeak && pMax && p2025) {
    setText("n-prison-drop", pct((1 - p2025.total / pPeak.total) * 100, 0));
    setText("n-outofstate", fmt(p2025.contracted));
    setText("n-outofstate-peak", fmt(pMax.contracted));
    setText("n-outofstate-pct", pct((p2025.contracted / p2025.total) * 100, 0));
  }
  var h2016 = HOM[2016], h2024 = HOM[2024], h2007 = HOM[2007];
  if (h2016 && h2024) setText("n-homeless-rise", pct(((h2024.total / h2016.total) - 1) * 100, 0));
  if (h2007 && h2024) setText("n-homeless-vs07", pct(((h2024.total / h2007.total) - 1) * 100, 0));
  var c75 = CR.rates_state["Total Index"][1975], c21 = CR.rates_state["Total Index"][2021];
  if (c75 && c21) setText("n-crime-drop", pct((1 - c21 / c75) * 100, 0));
})();

/* ==========================================================================
   DATA EXPLORER — decodes the compact observation store, then sorts, filters,
   paginates and exports. Every row carries its own source attribution.
   ========================================================================== */
(function explorer() {
  var $ = function (id) { return document.getElementById(id); };
  var body = $("ex-body");
  var O = window.DATA && window.DATA.obs;
  if (!body || !O) return;

  var DS = O.ds, U = O.u, M = O.m, G = O.g, SRC = window.DATA.sources || [];
  // decode into row objects: {d,m,g,u,y,v,s}
  var ALL = O.r.map(function (r) {
    return { di: r[0], mi: r[1], gi: r[2], ui: r[3], y: r[4], v: r[5],
             d: DS[r[0]], m: M[r[1]], g: G[r[2]], u: U[r[3]] };
  });
  var PAGE = 60;

  var DS_RANK = { "Homelessness": 0, "Crime": 1, "Incarceration": 2, "Context": 3 };
  var DS_CLASS = { "Crime": "crime", "Homelessness": "homeless", "Incarceration": "prison", "Context": "context" };
  var DS_COLOR = { "Homelessness": "#b8451f", "Crime": "#a67c1f", "Incarceration": "#0d6b74", "Context": "#7d949d" };
  var SRC_BY_DS = {};
  SRC.forEach(function (s) { SRC_BY_DS[DS[s.id]] = s; });

  var state = { q: "", ds: new Set(DS), metric: "", geo: "", year: "", sort: "d", dir: 1, page: 0 };

  function fmt(v) { return Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* ---- filter option builders ---- */
  var mSel = $("ex-metric");
  var seenM = {};
  M.forEach(function (m, i) {
    if (seenM[m]) return; seenM[m] = 1;
    var op = document.createElement("option");
    op.value = String(i); op.textContent = m;
    mSel.appendChild(op);
  });

  var gSel = $("ex-geo");
  G.forEach(function (g, i) {
    var op = document.createElement("option");
    op.value = String(i); op.textContent = g;
    gSel.appendChild(op);
  });

  var ySel = $("ex-year");
  var years = Array.from(new Set(ALL.map(function (o) { return o.y; }))).sort(function (a, b) { return a - b; });
  years.forEach(function (y) {
    var op = document.createElement("option");
    op.value = String(y); op.textContent = y;
    ySel.appendChild(op);
  });

  /* ---- dataset chips ---- */
  var chips = $("ex-chips");
  DS.forEach(function (ds) {
    var n = ALL.filter(function (o) { return o.d === ds; }).length;
    if (!n) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "ex-chip"; b.setAttribute("aria-pressed", "true");
    b.innerHTML = '<span class="dot" style="background:' + DS_COLOR[ds] + '"></span>' + ds +
      ' <span style="opacity:.55">' + n.toLocaleString("en-US") + "</span>";
    b.addEventListener("click", function () {
      if (state.ds.has(ds)) state.ds.delete(ds); else state.ds.add(ds);
      if (!state.ds.size) state.ds.add(ds);
      b.setAttribute("aria-pressed", state.ds.has(ds) ? "true" : "false");
      state.page = 0; render();
    });
    chips.appendChild(b);
  });

  /* ---- filtering ---- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return ALL.filter(function (o) {
      if (!state.ds.has(o.d)) return false;
      if (state.metric !== "" && String(o.mi) !== state.metric) return false;
      if (state.geo !== "" && String(o.gi) !== state.geo) return false;
      if (state.year && String(o.y) !== state.year) return false;
      if (q && (o.m + " " + o.g + " " + o.d).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function sorted(rows) {
    var k = state.sort, dir = state.dir;
    return rows.slice().sort(function (a, b) {
      if (k === "y" || k === "v") {
        return (a[k] - b[k]) * dir || (DS_RANK[a.d] - DS_RANK[b.d]) || a.m.localeCompare(b.m);
      }
      var x, y;
      if (k === "d") { x = DS_RANK[a.d]; y = DS_RANK[b.d]; }
      else { x = String(a[k]); y = String(b[k]); }
      return ((x < y ? -1 : x > y ? 1 : 0) * dir) || (a.y - b.y);
    });
  }

  var current = [];

  function render() {
    var rows = sorted(filtered());
    current = rows;
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var start = state.page * PAGE;
    var slice = rows.slice(start, start + PAGE);

    $("ex-shown").textContent = slice.length ? (start + 1) + "–" + (start + slice.length) : "0";
    $("ex-count").textContent = rows.length.toLocaleString("en-US");
    var yrs = rows.map(function (o) { return o.y; });
    $("ex-range").textContent = yrs.length ? "Years " + Math.min.apply(null, yrs) + "–" + Math.max.apply(null, yrs) : "";
    $("ex-page").textContent = state.page + 1;
    $("ex-pages").textContent = pages;
    $("ex-prev").disabled = state.page === 0;
    $("ex-next").disabled = state.page >= pages - 1;
    $("ex-sortlabel").textContent = "Sorted by " +
      ({ d: "dataset", m: "measure", g: "geography", y: "year", v: "value", u: "unit" }[state.sort]) +
      (state.dir > 0 ? " ↑" : " ↓");

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="ex-empty">No rows match those filters.</td></tr>';
      return;
    }

    var buf = [];
    slice.forEach(function (o) {
      var src = SRC_BY_DS[o.d];
      var srcCell = src
        ? '<a class="ex-src" href="' + esc(src.url) + '" target="_blank" rel="noopener" title="' + esc(src.name + " · " + src.period) + '">source ↗</a>'
        : "—";
      buf.push(
        '<tr>' +
        '<td><span class="ex-badge ' + (DS_CLASS[o.d] || "context") + '">' + o.d + "</span></td>" +
        "<td>" + esc(o.m) + "</td>" +
        '<td class="ex-hide-sm">' + esc(o.g) + "</td>" +
        '<td class="y">' + o.y + "</td>" +
        '<td class="num">' + fmt(o.v) + "</td>" +
        '<td class="ex-hide-sm">' + esc(o.u) + "</td>" +
        '<td class="ex-hide-sm">' + srcCell + "</td>" +
        "</tr>"
      );
    });
    body.innerHTML = buf.join("");
  }

  function gotoPage(p) {
    var pages = Math.max(1, Math.ceil(current.length / PAGE));
    if (p < 0 || p >= pages) return;
    state.page = p; render();
  }

  /* ---- events ---- */
  var qEl = $("ex-q"), t;
  qEl.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () { state.q = qEl.value; state.page = 0; render(); }, 120);
  });
  mSel.addEventListener("change", function () { state.metric = mSel.value; state.page = 0; render(); });
  gSel.addEventListener("change", function () { state.geo = gSel.value; state.page = 0; render(); });
  ySel.addEventListener("change", function () { state.year = ySel.value; state.page = 0; render(); });

  Array.prototype.forEach.call(document.querySelectorAll(".ex-table thead th"), function (th) {
    th.addEventListener("click", function () {
      var k = th.dataset.sort;
      if (!k) return;
      if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = (k === "y" || k === "v") ? -1 : 1; }
      Array.prototype.forEach.call(document.querySelectorAll(".ex-table thead th"), function (o) { o.removeAttribute("aria-sort"); });
      th.setAttribute("aria-sort", state.dir > 0 ? "ascending" : "descending");
      var ar = th.querySelector(".arrow");
      if (ar) ar.textContent = state.dir > 0 ? "▲" : "▼";
      state.page = 0; render();
    });
  });

  $("ex-prev").addEventListener("click", function () { gotoPage(state.page - 1); });
  $("ex-next").addEventListener("click", function () { gotoPage(state.page + 1); });
  var reset = $("ex-reset");
  if (reset) reset.addEventListener("click", function () {
    state.q = ""; state.metric = ""; state.geo = ""; state.year = "";
    state.ds = new Set(DS); state.page = 0; state.sort = "d"; state.dir = 1;
    qEl.value = ""; mSel.value = ""; gSel.value = ""; ySel.value = "";
    Array.prototype.forEach.call(chips.children, function (c) { c.setAttribute("aria-pressed", "true"); });
    render();
  });

  /* ---- CSV export of the current filtered + sorted set ---- */
  $("ex-download").addEventListener("click", function () {
    var rows = current.length ? current : sorted(filtered());
    var head = ["dataset", "measure", "geography", "year", "value", "unit", "source", "source_url"];
    var lines = [head.join(",")];
    rows.forEach(function (o) {
      var src = SRC_BY_DS[o.d] || {};
      lines.push([o.d, o.m, o.g, o.y, o.v, o.u, src.name || "", src.url || ""].map(function (c) {
        var s = String(c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hawaii-justice-data.csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  });

  /* ---- header counters ---- */
  var tot = $("ex-total"), met = $("ex-metrics"), geoEl = $("ex-geos");
  if (tot) tot.textContent = ALL.length.toLocaleString("en-US");
  if (met) met.textContent = new Set(ALL.map(function (o) { return o.m; })).size;
  if (geoEl) geoEl.textContent = G.length;

  render();
})();
