"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphOut, GraphNode } from "@/lib/types";

// Cluster palette (terminal-friendly).
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
}

function clusterColor(c: number | null): string {
  if (c == null) return "#6b7686";
  return PALETTE[((c % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/**
 * Interactive force-directed graph on a canvas — no external deps.
 * Nodes are channel profile pictures (clipped to circles), sized by PageRank,
 * ringed in their cluster color. Scroll to zoom, drag background to pan, drag a
 * node to reposition, hover to highlight its neighbors, click to open.
 */
export function GraphCanvas({ data }: { data: GraphOut }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<SimNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cv: HTMLCanvasElement = canvas;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const W = (cv.width = cv.offsetWidth);
    const H = (cv.height = cv.offsetHeight);

    const maxPr = Math.max(0.0001, ...data.nodes.map((n) => n.pagerank ?? 0));
    const nodes: SimNode[] = data.nodes.map((n, i) => ({
      ...n,
      x: W / 2 + Math.cos(i) * (60 + (i % 7) * 28),
      y: H / 2 + Math.sin(i) * (60 + (i % 7) * 28),
      vx: 0,
      vy: 0,
      r: 7 + Math.sqrt((n.pagerank ?? 0) / maxPr) * 20,
    }));
    const index = new Map(nodes.map((n) => [n.id, n]));
    const links = data.edges
      .map((e) => ({ s: index.get(e.source_id), t: index.get(e.target_id), w: e.weight }))
      .filter((l) => l.s && l.t) as { s: SimNode; t: SimNode; w: number }[];

    // adjacency for hover-highlight
    const neighbors = new Map<number, Set<number>>();
    for (const n of nodes) neighbors.set(n.id, new Set());
    for (const l of links) {
      neighbors.get(l.s.id)!.add(l.t.id);
      neighbors.get(l.t.id)!.add(l.s.id);
    }

    // Preload avatar images (clipped into circles at draw time).
    const avatars = new Map<number, HTMLImageElement>();
    for (const n of nodes) {
      if (!n.username) continue;
      const img = new Image();
      // NOTE: do NOT set crossOrigin — Telegram's userpic endpoint sends no CORS
      // headers, so a crossOrigin request fails to load. We only drawImage (never
      // read pixels back), so an un-tainted canvas is fine here.
      img.src = `https://t.me/i/userpic/320/${n.username}.jpg`;
      img.onload = () => avatars.set(n.id, img);
    }

    // view transform
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    // interaction state
    let dragNode: SimNode | null = null;
    let panning = false;
    let last = { x: 0, y: 0 };
    let hovered: SimNode | null = null;

    function screenToWorld(mx: number, my: number) {
      return { x: (mx - offsetX) / scale, y: (my - offsetY) / scale };
    }

    let alpha = 1;
    function tick() {
      alpha *= 0.985;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 0.01;
          const f = (1600 / d2) * alpha;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x;
        const dy = l.t.y - l.s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 80) * 0.01 * alpha;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        l.s.vx += fx; l.s.vy += fy;
        l.t.vx -= fx; l.t.vy -= fy;
      }
      for (const n of nodes) {
        if (n === dragNode) continue;
        n.vx += (W / 2 - n.x) * 0.0006 * alpha;
        n.vy += (H / 2 - n.y) * 0.0006 * alpha;
        n.x += n.vx; n.y += n.vy;
        n.vx *= 0.86; n.vy *= 0.86;
      }
    }

    function isActive(n: SimNode): boolean {
      if (!hovered) return true;
      return n === hovered || neighbors.get(hovered.id)!.has(n.id);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // edges
      for (const l of links) {
        const active = !hovered || l.s === hovered || l.t === hovered;
        ctx.strokeStyle = active ? "rgba(61,220,151,0.30)" : "rgba(120,134,150,0.10)";
        ctx.lineWidth = active ? Math.min(2.5, 0.5 + l.w * 0.3) : 0.5;
        ctx.beginPath();
        ctx.moveTo(l.s.x, l.s.y);
        ctx.lineTo(l.t.x, l.t.y);
        ctx.stroke();
      }

      // nodes
      for (const n of nodes) {
        const active = isActive(n);
        ctx.globalAlpha = active ? 1 : 0.25;
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
          // initial letter
          ctx.fillStyle = "#0a0c10";
          ctx.font = `${Math.max(8, n.r)}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((n.title.trim()[0] ?? "?").toUpperCase(), n.x, n.y + 0.5);
          ctx.textAlign = "start";
        }
        // cluster-colored ring
        ctx.beginPath();
        ctx.lineWidth = n === hovered ? 3 : 2;
        ctx.strokeStyle = clusterColor(n.cluster_id);
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // labels for the most important / hovered nodes
      ctx.fillStyle = "#d7dde6";
      ctx.font = "11px ui-monospace, monospace";
      for (const n of nodes) {
        if (n === hovered || n.r > 16) {
          ctx.globalAlpha = isActive(n) ? 1 : 0.3;
          ctx.fillText(n.title, n.x + n.r + 3, n.y + 3);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    let raf = 0;
    function loop() {
      if (alpha > 0.02 || dragNode) tick();
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    function nodeAt(mx: number, my: number): SimNode | null {
      const w = screenToWorld(mx, my);
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
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
      const p = pos(ev);
      downAt = p;
      const n = nodeAt(p.x, p.y);
      if (n) {
        dragNode = n;
        alpha = Math.max(alpha, 0.3);
      } else {
        panning = true;
      }
      last = p;
    }
    function onMove(ev: MouseEvent) {
      const p = pos(ev);
      if (dragNode) {
        const w = screenToWorld(p.x, p.y);
        dragNode.x = w.x; dragNode.y = w.y;
        dragNode.vx = 0; dragNode.vy = 0;
        return;
      }
      if (panning) {
        offsetX += p.x - last.x;
        offsetY += p.y - last.y;
        last = p;
        return;
      }
      hovered = nodeAt(p.x, p.y);
      setHover(hovered);
      cv.style.cursor = hovered ? "pointer" : "grab";
    }
    function onUp(ev: MouseEvent) {
      const p = pos(ev);
      const moved = Math.hypot(p.x - downAt.x, p.y - downAt.y);
      if (dragNode && moved < 4) {
        window.location.href = `/channel/${dragNode.id}`;
      }
      dragNode = null;
      panning = false;
    }
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const p = pos(ev);
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale = Math.min(4, Math.max(0.3, scale * factor));
      // zoom toward cursor
      offsetX = p.x - (p.x - offsetX) * (newScale / scale);
      offsetY = p.y - (p.y - offsetY) * (newScale / scale);
      scale = newScale;
    }

    cv.addEventListener("mousedown", onDown);
    cv.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    cv.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("mousedown", onDown);
      cv.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cv.removeEventListener("wheel", onWheel);
    };
  }, [data]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-[560px] w-full rounded-lg border border-border bg-surface/40"
      />
      <div className="pointer-events-none absolute left-3 top-3 font-mono text-[11px] text-muted">
        {data.nodes.length} nodes · {data.edges.length} edges · scroll to zoom ·
        drag to pan / move · click to open
      </div>
      {hover && (
        <div className="pointer-events-none absolute right-3 top-3 panel px-3 py-2">
          <div className="font-mono text-xs text-fg-bright">{hover.title}</div>
          <div className="mt-0.5 font-mono text-[10px] text-muted">
            {hover.username ? `@${hover.username} · ` : ""}pagerank{" "}
            {((hover.pagerank ?? 0) * 1000).toFixed(1)} · in {hover.in_degree ?? 0}{" "}
            · cluster {hover.cluster_id ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}
