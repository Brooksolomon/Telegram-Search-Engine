"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphOut, GraphNode } from "@/lib/types";

const PALETTE = [
  "#3ddc97", "#5ac8fa", "#f5a623", "#ff5c5c", "#b388ff",
  "#ffd166", "#06d6a0", "#ef476f", "#118ab2", "#8d99ae",
];

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pinned?: boolean;
}

function clusterColor(c: number | null): string {
  if (c == null) return "#6b7686";
  return PALETTE[((c % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

export function GraphCanvas({ data }: { data: GraphOut }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<SimNode | null>(null);
  const [query, setQuery] = useState("");
  const [activeCluster, setActiveCluster] = useState<number | null>(null);

  // shared mutable controls the effect reads each frame
  const ctrl = useRef({
    activeCluster: null as number | null,
    focusId: null as number | null,
    resetView: 0,
  });
  ctrl.current.activeCluster = activeCluster;

  const clusters = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of data.nodes) {
      if (n.cluster_id != null) m.set(n.cluster_id, (m.get(n.cluster_id) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  function focusChannel() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = data.nodes.find(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.username ?? "").toLowerCase().includes(q)
    );
    if (hit) ctrl.current.focusId = hit.id;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cv: HTMLCanvasElement = canvas;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    let W = (cv.width = cv.offsetWidth);
    let H = (cv.height = cv.offsetHeight);

    const maxPr = Math.max(0.0001, ...data.nodes.map((n) => n.pagerank ?? 0));
    const nodes: SimNode[] = data.nodes.map((n, i) => ({
      ...n,
      x: W / 2 + Math.cos(i * 2.4) * (120 + (i % 11) * 40),
      y: H / 2 + Math.sin(i * 2.4) * (120 + (i % 11) * 40),
      vx: 0, vy: 0,
      r: 9 + Math.sqrt((n.pagerank ?? 0) / maxPr) * 26,
    }));
    const index = new Map(nodes.map((n) => [n.id, n]));
    const links = data.edges
      .map((e) => ({ s: index.get(e.source_id), t: index.get(e.target_id), w: e.weight }))
      .filter((l) => l.s && l.t) as { s: SimNode; t: SimNode; w: number }[];

    const neighbors = new Map<number, Set<number>>();
    for (const n of nodes) neighbors.set(n.id, new Set());
    for (const l of links) {
      neighbors.get(l.s.id)!.add(l.t.id);
      neighbors.get(l.t.id)!.add(l.s.id);
    }

    // Per-cluster anchor points arranged on a big circle, so communities
    // physically separate into their own regions.
    const clusterIds = [...new Set(nodes.map((n) => n.cluster_id).filter((c) => c != null))] as number[];
    const anchors = new Map<number, { x: number; y: number }>();
    clusterIds.forEach((cid, i) => {
      const a = (i / Math.max(1, clusterIds.length)) * Math.PI * 2;
      anchors.set(cid, {
        x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.32,
        y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.32,
      });
    });

    const avatars = new Map<number, HTMLImageElement>();
    for (const n of nodes) {
      if (!n.username) continue;
      const img = new Image();
      img.src = `https://t.me/i/userpic/320/${n.username}.jpg`;
      img.onload = () => avatars.set(n.id, img);
    }

    let scale = 0.85;
    let offsetX = 0;
    let offsetY = 0;
    let dragNode: SimNode | null = null;
    let panning = false;
    let last = { x: 0, y: 0 };
    let hovered: SimNode | null = null;

    function screenToWorld(mx: number, my: number) {
      return { x: (mx - offsetX) / scale, y: (my - offsetY) / scale };
    }
    function resetView() {
      scale = 0.85; offsetX = 0; offsetY = 0;
    }

    function visible(n: SimNode): boolean {
      const ac = ctrl.current.activeCluster;
      return ac == null || n.cluster_id === ac;
    }

    let alpha = 1;
    function tick() {
      alpha = Math.max(alpha * 0.99, 0.04); // never fully freeze (stays lively)
      // repulsion (stronger, with collision so avatars don't overlap)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          // hard collision: push apart if circles overlap
          const minDist = a.r + b.r + 14;
          if (d < minDist) {
            const push = (minDist - d) * 0.5;
            const ux = dx / d, uy = dy / d;
            a.x += ux * push; a.y += uy * push;
            b.x -= ux * push; b.y -= uy * push;
          }
          const f = (4200 / (d * d)) * alpha;
          const ux = dx / d, uy = dy / d;
          a.vx += ux * f; a.vy += uy * f;
          b.vx -= ux * f; b.vy -= uy * f;
        }
      }
      // springs (looser/longer so the graph spreads)
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 150) * 0.006 * alpha;
        const ux = dx / d, uy = dy / d;
        l.s.vx += ux * f; l.s.vy += uy * f;
        l.t.vx -= ux * f; l.t.vy -= uy * f;
      }
      // cluster gravity — pull each node toward its community anchor
      for (const n of nodes) {
        const a = n.cluster_id != null ? anchors.get(n.cluster_id) : null;
        const tx = a ? a.x : W / 2;
        const ty = a ? a.y : H / 2;
        n.vx += (tx - n.x) * 0.004 * alpha;
        n.vy += (ty - n.y) * 0.004 * alpha;
      }
      for (const n of nodes) {
        if (n === dragNode || n.pinned) continue;
        n.x += n.vx; n.y += n.vy;
        n.vx *= 0.82; n.vy *= 0.82;
      }
    }

    function isActive(n: SimNode): boolean {
      if (!visible(n)) return false;
      if (!hovered) return true;
      return n === hovered || neighbors.get(hovered.id)!.has(n.id);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      for (const l of links) {
        if (!visible(l.s) || !visible(l.t)) continue;
        const active = !hovered || l.s === hovered || l.t === hovered;
        ctx.strokeStyle = active ? "rgba(61,220,151,0.28)" : "rgba(120,134,150,0.07)";
        ctx.lineWidth = active ? Math.min(3, 0.6 + l.w * 0.35) : 0.5;
        ctx.beginPath();
        ctx.moveTo(l.s.x, l.s.y);
        ctx.lineTo(l.t.x, l.t.y);
        ctx.stroke();
      }

      for (const n of nodes) {
        if (!visible(n)) continue;
        const active = isActive(n);
        ctx.globalAlpha = active ? 1 : 0.18;
        const img = avatars.get(n.id);
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.fillStyle = clusterColor(n.cluster_id);
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0a0c10";
          ctx.font = `${Math.max(9, n.r)}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((n.title.trim()[0] ?? "?").toUpperCase(), n.x, n.y + 0.5);
          ctx.textAlign = "start";
        }
        ctx.beginPath();
        ctx.lineWidth = n === hovered ? 3.5 : 2;
        ctx.strokeStyle = clusterColor(n.cluster_id);
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = "#d7dde6";
      ctx.font = "11px ui-monospace, monospace";
      for (const n of nodes) {
        if (!visible(n)) continue;
        if (n === hovered || n.r > 20) {
          ctx.globalAlpha = isActive(n) ? 1 : 0.25;
          ctx.fillText(n.title, n.x + n.r + 4, n.y + 3);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function applyControls() {
      // focus: center + pin a searched node
      if (ctrl.current.focusId != null) {
        const n = index.get(ctrl.current.focusId);
        ctrl.current.focusId = null;
        if (n) {
          scale = 1.4;
          offsetX = W / 2 - n.x * scale;
          offsetY = H / 2 - n.y * scale;
          hovered = n;
          setHover(n);
        }
      }
      if (ctrl.current.resetView) {
        ctrl.current.resetView = 0;
        resetView();
      }
    }

    let raf = 0;
    function loop() {
      applyControls();
      tick();
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    function nodeAt(mx: number, my: number): SimNode | null {
      const w = screenToWorld(mx, my);
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!visible(n)) continue;
        if ((n.x - w.x) ** 2 + (n.y - w.y) ** 2 <= (n.r + 2) ** 2) return n;
      }
      return null;
    }
    function pos(ev: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    let downAt = { x: 0, y: 0 };
    function onDown(ev: MouseEvent) {
      const p = pos(ev); downAt = p;
      const n = nodeAt(p.x, p.y);
      if (n) { dragNode = n; n.pinned = true; } else panning = true;
      last = p;
    }
    function onMove(ev: MouseEvent) {
      const p = pos(ev);
      if (dragNode) {
        const w = screenToWorld(p.x, p.y);
        dragNode.x = w.x; dragNode.y = w.y; dragNode.vx = 0; dragNode.vy = 0;
        return;
      }
      if (panning) {
        offsetX += p.x - last.x; offsetY += p.y - last.y; last = p; return;
      }
      hovered = nodeAt(p.x, p.y);
      setHover(hovered);
      cv.style.cursor = hovered ? "pointer" : "grab";
    }
    function onUp(ev: MouseEvent) {
      const p = pos(ev);
      const moved = Math.hypot(p.x - downAt.x, p.y - downAt.y);
      if (dragNode) {
        if (moved < 4) window.location.href = `/channel/${dragNode.id}`;
        else dragNode.pinned = false; // let it rejoin the sim after a drag
      }
      dragNode = null; panning = false;
    }
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const p = pos(ev);
      const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.min(4, Math.max(0.25, scale * factor));
      offsetX = p.x - (p.x - offsetX) * (ns / scale);
      offsetY = p.y - (p.y - offsetY) * (ns / scale);
      scale = ns;
    }
    function onDblClick() {
      resetView();
    }
    function onResize() {
      W = cv.width = cv.offsetWidth;
      H = cv.height = cv.offsetHeight;
    }

    cv.addEventListener("mousedown", onDown);
    cv.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    cv.addEventListener("wheel", onWheel, { passive: false });
    cv.addEventListener("dblclick", onDblClick);
    window.addEventListener("resize", onResize);

    // expose reset to the React button via the shared ctrl
    const resetWatcher = setInterval(() => {
      if (ctrl.current.resetView) { /* handled in loop */ }
    }, 1000);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(resetWatcher);
      cv.removeEventListener("mousedown", onDown);
      cv.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cv.removeEventListener("wheel", onWheel);
      cv.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("resize", onResize);
    };
  }, [data]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
          <span className="font-mono text-xs text-accent">{">"}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && focusChannel()}
            placeholder="find a channel…"
            className="w-44 bg-transparent font-mono text-xs text-fg-bright placeholder:text-muted/60 focus:outline-none"
          />
          <button
            onClick={focusChannel}
            className="font-mono text-[10px] text-muted hover:text-accent"
          >
            ↵ center
          </button>
        </div>
        <button
          onClick={() => (ctrl.current.resetView = 1)}
          className="rounded border border-border px-3 py-1.5 font-mono text-xs text-muted hover:border-accent/40 hover:text-accent"
        >
          reset view
        </button>
        {activeCluster != null && (
          <button
            onClick={() => setActiveCluster(null)}
            className="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent"
          >
            cluster {activeCluster} ✕
          </button>
        )}
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-[78vh] min-h-[600px] w-full rounded-lg border border-border bg-surface/40"
        />
        <div className="pointer-events-none absolute left-3 top-3 font-mono text-[11px] text-muted">
          {data.nodes.length} nodes · {data.edges.length} edges · scroll zoom ·
          drag pan/move · dbl-click reset · click to open
        </div>
        {hover && (
          <div className="pointer-events-none absolute right-3 top-3 panel px-3 py-2">
            <div className="font-mono text-xs text-fg-bright">{hover.title}</div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">
              {hover.username ? `@${hover.username} · ` : ""}pr{" "}
              {((hover.pagerank ?? 0) * 1000).toFixed(1)} · in {hover.in_degree ?? 0}{" "}
              · cluster {hover.cluster_id ?? "—"}
            </div>
          </div>
        )}

        {/* Cluster legend / filter */}
        <div className="absolute bottom-3 left-3 flex max-w-[70%] flex-wrap gap-1.5">
          {clusters.map(([cid, count]) => (
            <button
              key={cid}
              onClick={() => setActiveCluster(activeCluster === cid ? null : cid)}
              className={`flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                activeCluster === cid
                  ? "border-fg-bright text-fg-bright"
                  : "border-border text-muted hover:text-fg"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: clusterColor(cid) }}
              />
              c{cid} · {count}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
