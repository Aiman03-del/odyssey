"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, FogExp2, MathUtils } from "three";
import { WORLDS, SPACE_TO_WATER, WATER_TO_MOUNTAIN } from "@/config/worlds";

const spaceBg = new Color(WORLDS.space.background);
const waterBg = new Color(WORLDS.underwater.background);
const mountainBg = new Color(WORLDS.mountains.background);
const tmp = new Color(); // Temporary color used for calculations.

// Adjust the background color and fog based on the camera position (Space → Water → Mountains).
export default function Atmosphere() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    scene.background = new Color(WORLDS.space.background);
    scene.fog = new FogExp2(WORLDS.space.background, 0);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame(({ camera }) => {
    const depth = -camera.position.z;
    const u = MathUtils.smoothstep(depth, SPACE_TO_WATER.from, SPACE_TO_WATER.to);
    const m = MathUtils.smoothstep(depth, WATER_TO_MOUNTAIN.from, WATER_TO_MOUNTAIN.to);

    // Blend from Space to Water, then from that color to Mountains.
    tmp.lerpColors(spaceBg, waterBg, u).lerp(mountainBg, m);

    const density = MathUtils.lerp(
      MathUtils.lerp(WORLDS.space.fog, WORLDS.underwater.fog, u),
      WORLDS.mountains.fog,
      m
    );

    if (scene.background instanceof Color) scene.background.copy(tmp);
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.copy(tmp); // Match the fog color to the background.
      scene.fog.density = density;
    }
  });

  return null;
}