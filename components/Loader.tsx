"use client";

import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";

// Loading screen that displays asset loading progress.
export default function Loader() {
  const { progress } = useProgress();
  const [hidden, setHidden] = useState(false);

  // Hide shortly after loading reaches 100%.
  useEffect(() => {
    if (progress === 100) {
      const t = setTimeout(() => setHidden(true), 500);
      return () => clearTimeout(t);
    }
  }, [progress]);

  // Safety fallback: hide after 4 seconds if progress does not advance.
  useEffect(() => {
    const t = setTimeout(() => setHidden(true), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-700"
      style={{ opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : "auto" }}
    >
      <h1 className="mb-4 text-3xl tracking-[0.4em]">ODYSSEY</h1>
      <div className="h-px w-48 bg-white/20">
        <div
          className="h-full bg-white transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-white/60">{Math.round(progress)}%</p>
    </div>
  );
}