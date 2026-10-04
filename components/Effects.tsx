"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, ToneMapping } from "@react-three/postprocessing";
import { BloomEffect, ToneMappingMode } from "postprocessing";
import { MathUtils } from "three";
import { WATER_TO_MOUNTAIN } from "@/config/worlds";

// Bloom adds a glow around only the brightest objects (the sun and lights).
// Tone mapping softly blends bright areas, like cinematic film.
export default function Effects({ lowEnd }: { lowEnd: boolean }) {
  const bloom = useRef<BloomEffect>(null);

  useFrame(({ camera }) => {
    if (!bloom.current) return;
    const k =
      1 - MathUtils.smoothstep(-camera.position.z, WATER_TO_MOUNTAIN.from, WATER_TO_MOUNTAIN.to);
    bloom.current.intensity = 0.15 + 0.85 * k; // Lower intensity in the Mountains.
  });

  // Disable on low-end devices as a performance fallback.
  if (lowEnd) return null;

  return (
    <EffectComposer multisampling={2}>
      <Bloom
        ref={bloom}
        intensity={1}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        mipmapBlur
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}