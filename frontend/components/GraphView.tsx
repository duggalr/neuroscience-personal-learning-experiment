"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import { fetchGraph } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import type { GraphData } from "@/lib/types";

interface SimNode {
  id: string;
  title: string;
  links: number;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
}
interface SimLink {
  source: SimNode;
  target: SimNode;
}

function radiusOf(links: number) {
  return 5 + Math.min(8, links * 0.9);
}
function truncate(s: string, n = 26) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function GraphView() {
  const { data, error, loading } = useAsync(fetchGraph);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const router = useRouter();

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [links, setLinks] = useState<SimLink[]>([]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);

  const pan = useRef({ active: false, sx: 0, sy: 0, moved: false });
  const dragNode = useRef<{ node: SimNode; sx: number; sy: number; moved: boolean } | null>(
    null
  );
  // Keep latest view/size for coordinate math inside pointer handlers.
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data || data.nodes.length === 0) return;
    const simNodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: (Math.random() - 0.5) * 600,
      y: (Math.random() - 0.5) * 600,
    }));
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = data.edges
      .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)! }))
      .filter((l) => l.source && l.target);

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(120)
          .strength(0.25)
      )
      .force("charge", forceManyBody<SimNode>().strength(-650))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<SimNode>((d) => radiusOf(d.links) + 30));

    simRef.current = sim;
    sim.on("tick", () => {
      setNodes([...simNodes]);
      setLinks([...simLinks]);
    });
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [data]);

  const toGraph = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const s = sizeRef.current;
    return {
      x: (clientX - rect.left - (s.w / 2 + v.x)) / v.k,
      y: (clientY - rect.top - (s.h / 2 + v.y)) / v.k,
    };
  };

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({ ...v, k: Math.max(0.2, Math.min(3, v.k * factor)) }));
  };

  // Background pan
  const onSvgDown = (e: React.PointerEvent) => {
    if (dragNode.current) return;
    pan.current = { active: true, sx: e.clientX, sy: e.clientY, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (dragNode.current) {
      const dn = dragNode.current;
      if (Math.abs(e.clientX - dn.sx) + Math.abs(e.clientY - dn.sy) > 4) dn.moved = true;
      const { x, y } = toGraph(e.clientX, e.clientY);
      dn.node.fx = x;
      dn.node.fy = y;
      return;
    }
    if (pan.current.active) {
      const dx = e.clientX - pan.current.sx;
      const dy = e.clientY - pan.current.sy;
      pan.current.sx = e.clientX;
      pan.current.sy = e.clientY;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onUp = () => {
    if (dragNode.current) {
      const dn = dragNode.current;
      simRef.current?.alphaTarget(0);
      dn.node.fx = null;
      dn.node.fy = null;
      const wasClick = !dn.moved;
      dragNode.current = null;
      if (wasClick) router.push(`/notes/${dn.node.id}`);
      return;
    }
    pan.current.active = false;
  };

  const onNodeDown = (e: React.PointerEvent, n: SimNode) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragNode.current = { node: n, sx: e.clientX, sy: e.clientY, moved: false };
    simRef.current?.alphaTarget(0.3).restart();
    n.fx = n.x;
    n.fy = n.y;
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden"
      style={{ height: "calc(100dvh - 13rem)", background: "var(--color-surface)" }}
    >
      {loading && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="spinner" aria-label="Loading" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-[0.875rem]" style={{ color: "var(--color-muted)" }}>
            {error}
          </p>
        </div>
      )}
      {data && data.nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-[0.9375rem]" style={{ color: "var(--color-muted)" }}>
            Your knowledge map grows as you learn. Finish a concept and your first
            notes will appear here, linked into a web.
          </p>
        </div>
      )}

      {data && data.nodes.length > 0 && (
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          onWheel={onWheel}
          onPointerDown={onSvgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          style={{
            touchAction: "none",
            cursor: pan.current.active ? "grabbing" : "grab",
          }}
        >
          <g
            transform={`translate(${size.w / 2 + view.x}, ${size.h / 2 + view.y}) scale(${view.k})`}
          >
            {links.map((l, i) => (
              <line
                key={i}
                x1={l.source.x}
                y1={l.source.y}
                x2={l.target.x}
                y2={l.target.y}
                stroke="var(--color-line-strong)"
                strokeWidth={1}
                strokeOpacity={
                  hover && (l.source.id === hover || l.target.id === hover) ? 0.9 : 0.4
                }
              />
            ))}
            {nodes.map((n) => {
              const r = radiusOf(n.links);
              const active = hover === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  style={{ cursor: "grab" }}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                  onPointerDown={(e) => onNodeDown(e, n)}
                >
                  <circle
                    r={r}
                    fill={active ? "var(--color-accent)" : "var(--color-accent-tint)"}
                    stroke="var(--color-accent)"
                    strokeWidth={active ? 2 : 1.5}
                  />
                  <text
                    x={r + 4}
                    y={3}
                    style={{
                      fontSize: Math.max(9, Math.min(13, 12 / view.k)),
                      fill: active ? "var(--color-ink)" : "var(--color-muted)",
                      fontWeight: active ? 600 : 500,
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    {truncate(n.title)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {data && data.nodes.length > 0 && (
        <div
          className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-[0.75rem]"
          style={{ color: "var(--color-faint)" }}
        >
          drag a concept to move it · drag the canvas to pan · scroll to zoom · tap to open
        </div>
      )}
    </div>
  );
}
