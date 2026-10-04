"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { Group } from "three";
import Atmosphere from "./Atmosphere";
import CameraRig from "./CameraRig";
import Effects from "./Effects";
import Human from "./Human";
import SpaceWorld from "./worlds/SpaceWorld";
import UnderwaterWorld from "./worlds/UnderwaterWorld";
import MountainWorld from "./worlds/MountainWorld";
import { VISIBLE } from "@/config/transitions";
import { useIsLowEnd } from "@/hooks/useIsLowEnd";

// Show only the world needed at the camera depth to improve performance.
function Worlds({ lowEnd }: { lowEnd: boolean }) {
  const space = useRef<Group>(null);
  const water = useRef<Group>(null);
  const mountain = useRef<Group>(null);

  useFrame(({ camera }) => {
    const depth = -camera.position.z;
    if (space.current) space.current.visible = depth < VISIBLE.space.max;
    if (water.current)
      water.current.visible = depth > VISIBLE.water.min && depth < VISIBLE.water.max;
    if (mountain.current) mountain.current.visible = depth > VISIBLE.mountain.min;
  });

  return (
    <>
      <group ref={space}>
        <SpaceWorld lowEnd={lowEnd} />
      </group>
      <group ref={water} visible={false}>
        <UnderwaterWorld lowEnd={lowEnd} />
      </group>
      <group ref={mountain} visible={false}>
        <MountainWorld lowEnd={lowEnd} />
      </group>
    </>
  );
}

export default function Experience() {
  const lowEnd = useIsLowEnd();

  return (
    <Canvas
      dpr={lowEnd ? 1 : [1, 2]}
      camera={{ fov: 60, near: 0.1, far: 500, position: [0, 0, 10] }}
      gl={{ antialias: !lowEnd }}
    >
      {/* FPS panel in the top-left corner; visible only in development. */}
      {process.env.NODE_ENV === "development" && <Stats />}

      <Suspense fallback={null}>
        <Atmosphere />
        <CameraRig />
        <Worlds lowEnd={lowEnd} />
        <Human />
        <Effects lowEnd={lowEnd} />
      </Suspense>
    </Canvas>
  );
}