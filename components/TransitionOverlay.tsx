"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { transitionState } from "@/config/transitions";

// DOM layer above the canvas: transition veil and world name.
export default function TransitionOverlay({ blur }: { blur: boolean }) {
  const veilRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastWorld = "";

    // gsap.ticker runs every frame without a React render, so it is fast.
    const tick = () => {
      const { veil, color, world } = transitionState;
      const v = veilRef.current;
      const l = labelRef.current;

      if (v) {
        v.style.opacity = String(veil);
        v.style.backgroundColor = color;
        // Apply blur only while the veil is visible; disable it on low-end devices.
        const b = blur && veil > 0.02 ? `blur(${(veil * 12).toFixed(1)}px)` : "none";
        v.style.setProperty("backdrop-filter", b);
      }

      if (l) {
        if (world !== lastWorld) {
          l.textContent = world;
          lastWorld = world;
        }
        // Fade the world name as the veil closes.
        l.style.opacity = String(1 - Math.min(veil * 1.5, 1));
      }
    };

    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [blur]);

  return (
    <>
      {/* Transition veil */}
      <div
        ref={veilRef}
        className="pointer-events-none fixed inset-0 z-40"
        style={{ opacity: 0 }}
      />
      {/* World name */}
      <div
        ref={labelRef}
        className="pointer-events-none fixed bottom-8 left-8 z-40 text-sm tracking-[0.4em] text-white"
        style={{ textShadow: "0 0 12px rgba(0,0,0,0.6)" }}
      />
    </>
  );
}