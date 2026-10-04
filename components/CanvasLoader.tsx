"use client";

import dynamic from "next/dynamic";
import Loader from "./Loader";
import TransitionOverlay from "./TransitionOverlay";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import { useIsLowEnd } from "@/hooks/useIsLowEnd";

// Disable SSR for the dynamic import because Three.js cannot run on the server.
const Experience = dynamic(() => import("./Experience"), { ssr: false });

export default function CanvasLoader() {
  useScrollProgress(); // Start scroll tracking.
  const lowEnd = useIsLowEnd();

  return (
    <>
      <Loader />
      <TransitionOverlay blur={!lowEnd} />
      {/* Keep the canvas fixed on screen while the page scrolls. */}
      <div className="fixed inset-0">
        <Experience />
      </div>
    </>
  );
}