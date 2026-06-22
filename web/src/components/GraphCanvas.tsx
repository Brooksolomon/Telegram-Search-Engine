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

/**
 * Self-contained force-directed graph on a canvas — no external deps, so it
 * builds anywhere. Nodes sized by PageRank, colored by cluster. Drag to pan,
 * hover for a label, click to open the channel.
 */
export function GraphCanvas({ data }: { data: GraphOut }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<SimNode | null>(null);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
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
      r: 4 + Math.sqrt((n.pagerank ?? 0) / maxPr) * 16,
    }));
    const index = new Map(nodes.map((n) => [n.id, n]));
    const links = data.edges
      .map((e) => ({ s: index.get(e.source_id), t: index.get(e.target_id), w: e.weight }))
      .filter((l) => l.s && l.t) as { s: SimNode; t: SimNode; w: number }[];

    // Pan / drag state
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let dragStart = { x: 0, y: 0 };
    let hovered: SimNode | null = null;

    function color(n: SimNode): string {
      const c = n.cluster_id;
      return c == null ? "#6b7686" : PALETTE[((c % PALETTE.length) + PALETTE.length) % PALETTE.length];
    }

    // Simple force simulation
    let alpha = 1;
    function tick() {
      alpha *= 0.985;
      // repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const f = (1200 / d2) * alpha;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      // spring along links
      for (const l of links) {
        let dx = l.t.x - l.s.x;
        let dy = l.t.y - l.s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 70) * 0.01 * alpha;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        l.s.vx += fx;
        l.s.vy += fy;
        l.t.vx -= fx;
        l.t.vy -= fy;
      }
      // centering + integrate
      for (const n of nodes) {
        n.vx += (W / 2 - n.x) * 0.0008 * alpha;
        n.vy += (H / 2 - n.y) * 0.0008 * alpha;
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.86;
        n.vy *= 0.86;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(offsetX, offsetY);

      // edges
      ctx.lineWidth = 0.6;
      for (const l of links) {
        ctx.strokeStyle = "rgba(120,134,150,0.18)";
        ctx.beginPath();
        ctx.moveTo(l.s.x, l.s.y);
        ctx.lineTo(l.t.x, l.t.y);
        ctx.stroke();
      }
      // nodes
      for (const n of nodes) {
        ctx.beginPath();
        ctx.fillStyle = color(n);
        ctx.globalAlpha = hovered && hovered !== n ? 0.35 : 1;
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // hovered label
      if (hovered) {
        ctx.fillStyle = "#f2f5f9";
        ctx.font = "12px ui-monospace, monospace";
        ctx.fillText(hovered.title, hovered.x + hovered.r + 4, hovered.y + 4);
      }
      ctx.restore();
    }

    let raf = 0;
    function loop() {
      if (alpha > 0.02) tick();
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    function nodeAt(mx: number, my: number): SimNode | null {
      const x = mx - offsetX;
      const y = my - offsetY;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if ((n.x - x) ** 2 + (n.y - y) ** 2 <= (n.r + 3) ** 2) return n;
      }
      return null;
    }

    function onMove(ev: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      if (dragging) {
        offsetX += mx - dragStart.x;
        offsetY += my - dragStart.y;
        dragStart = { x: mx, y: my };
        return;
      }
      hovered = nodeAt(mx, my);
      setHover(hovered);
      cv.style.cursor = hovered ? "pointer" : "grab";
    }
    function onDown(ev: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const n = nodeAt(mx, my);
      if (n) {
        window.location.href = `/channel/${n.id}`;
        return;
      }
      dragging = true;
      dragStart = { x: mx, y: my };
    }
    function onUp() {
      dragging = false;
    }

    cv.addEventListener("mousemove", onMove);
    cv.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("mousemove", onMove);
      cv.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
  }, [data]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-[520px] w-full rounded-lg border border-border bg-surface/40"
      />
      <div className="pointer-events-none absolute left-3 top-3 font-mono text-[11px] text-muted">
        {data.nodes.length} nodes · {data.edges.length} edges · drag to pan ·
        click a node to open
      </div>
      {hover && (
        <div className="pointer-events-none absolute right-3 top-3 panel px-3 py-2">
          <div className="font-mono text-xs text-fg-bright">{hover.title}</div>
          <div className="mt-0.5 font-mono text-[10px] text-muted">
            pagerank {((hover.pagerank ?? 0) * 1000).toFixed(1)} · in{" "}
            {hover.in_degree ?? 0} · cluster {hover.cluster_id ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}
