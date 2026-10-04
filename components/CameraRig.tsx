"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, MathUtils, PerspectiveCamera, Vector3 } from "three";
import { scrollState } from "@/hooks/useScrollProgress";
import { WALK } from "@/config/worlds";
import { updateTransition } from "@/config/transitions";

const BASE_FOV = 60;

// Camera path: Space (5) → Underwater (5) → Mountains (6 points).
export default function CameraRig() {
  const smooth = useRef(0);

  const path = useMemo(
    () =>
      new CatmullRomCurve3([
        // --- Space ---
        new Vector3(0, 0, 10),
        new Vector3(1, 0.5, -5),
        new Vector3(-1, 0, -20),
        new Vector3(0.5, -0.5, -35),
        new Vector3(0, 0, -50),
        // --- Underwater ---
        new Vector3(-1.5, -0.5, -75),
        new Vector3(1.5, 0.8, -100),
        new Vector3(-1, 0, -125),
        new Vector3(0.5, -0.5, -150),
        new Vector3(0, 1.2, -165), // Starts rising out of the water.
        // --- Mountains (y = 2.6, above the ground) ---
        new Vector3(0, 2.6, -182), // Has risen above the water.
        new Vector3(0.8, 2.6, -205),
        new Vector3(-0.8, 2.6, -230),
        new Vector3(0.6, 2.6, -255),
        new Vector3(-0.5, 2.6, -280),
        new Vector3(0, 2.6, -305),
      ]),
    []
  );

  useFrame((state, delta) => {
    smooth.current = MathUtils.damp(smooth.current, scrollState.progress, 4, delta);

    const p = path.getPointAt(smooth.current);
    state.camera.position.copy(p);

    // Calculate how far the veil has closed (0..1).
    const veil = updateTransition(-p.z);

    // Tilt the camera slightly downward while walking.
    const w = MathUtils.smoothstep(-p.z, WALK.from, WALK.to);
    state.camera.lookAt(p.x, p.y - 1.0 * w, p.z - 10);

    // Increase the FOV during transitions for a warp effect, then ease it back.
    const cam = state.camera as PerspectiveCamera;
    const targetFov = BASE_FOV + 18 * veil;
    if (Math.abs(cam.fov - targetFov) > 0.01) {
      cam.fov = MathUtils.damp(cam.fov, targetFov, 8, delta);
      cam.updateProjectionMatrix();
    }
  });

  return null;
}