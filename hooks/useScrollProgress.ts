"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Shared object for all consumers. Avoids repeated React state re-renders.
// Read directly from useFrame in the 3D scene.
export const scrollState = { progress: 0 };

// Call once to track the full page scroll (0 → 1).
export function useScrollProgress() {
  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        scrollState.progress = self.progress;
      },
    });
    return () => trigger.kill();
  }, []);
}