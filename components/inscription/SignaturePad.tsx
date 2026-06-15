"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignatureVect } from "@/lib/pdf/types";

// Repère logique = viewBox du PDF (lib/pdf : Svg viewBox 0 0 600 200). Les points
// capturés sont dans ce système → la signature s'affiche identique dans le PDF.
const W = 600;
const H = 200;

// Pad de signature maison : dessin au doigt (mobile/tablette) ou à la souris,
// + bouton « Effacer ». Émet un SignatureVect (ou null si vide) via onChange.
export function SignaturePad({
  onChange,
}: {
  onChange: (sig: SignatureVect | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<{ x: number; y: number }[][]>([]);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = c.width / W; // backing store scalé par DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
  }, []);

  // Dimensionne le backing store selon le DPR (netteté) une fois monté + au resize.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      c.width = W * dpr;
      c.height = H * dpr;
      redraw();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [redraw]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    // CSS px → repère logique (0..W, 0..H). L'aspect 3:1 garantit l'absence de
    // déformation par rapport au PDF.
    return {
      x: Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W)),
      y: Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H)),
    };
  }

  function commit() {
    const has = strokesRef.current.some((s) => s.length > 1);
    setEmpty(!has);
    onChange(has ? { width: W, height: H, strokes: strokesRef.current } : null);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawingRef.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    strokesRef.current.push([pointFromEvent(e)]);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    strokesRef.current[strokesRef.current.length - 1].push(pointFromEvent(e));
    redraw();
  }
  function onPointerEnd(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* déjà relâché */
    }
    commit();
  }

  function effacer() {
    strokesRef.current = [];
    redraw();
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
          className="w-full touch-none rounded-xl border border-line bg-paper-2"
          style={{ aspectRatio: "3 / 1" }}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-smoke">
            Signez ici (au doigt ou à la souris)
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-smoke">
          {empty ? "Aucune signature" : "Signature enregistrée ✓"}
        </span>
        <button
          type="button"
          onClick={effacer}
          disabled={empty}
          className="text-xs font-semibold text-smoke underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}
