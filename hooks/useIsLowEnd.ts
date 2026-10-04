"use client";

import { useState } from "react";

// Returns true on mobile or low-end devices so we can reduce effects.
export function useIsLowEnd(): boolean {
  const [lowEnd] = useState(() => {
    if (typeof window === "undefined") return false;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const smallScreen = window.innerWidth < 768;
    const fewCores = (nav.hardwareConcurrency ?? 8) <= 4;
    const lowMemory = (nav.deviceMemory ?? 8) <= 4;
    return smallScreen || fewCores || lowMemory;
  });
  return lowEnd;
}