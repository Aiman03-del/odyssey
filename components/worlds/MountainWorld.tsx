"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, MathUtils, PlaneGeometry } from "three";

// ---------- Dimensions ----------
const WIDTH = 260; // Terrain width (x).
const LEN = 180; // Terrain length (z).
const CENTER_Z = -250; // World center, near the middle of the camera path.

// Deterministic pseudo-random value (the same result every time).
const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

// ---------- Terrain height ----------
// Combine several sine waves to create natural-looking terrain (fbm = fractal noise).
function fbm(x: number, z: number) {
  let v = 0;
  let a = 1;
  let f = 0.035;
  for (let i = 0; i < 4; i++) {
    v +=
      a *
      (Math.sin(x * f + Math.cos(z * f * 0.8) * 1.7) * 0.5 +
        Math.sin(z * f * 1.1 - x * f * 0.4) * 0.3 +
        Math.sin((x + z) * f * 1.9) * 0.2);
    a *= 0.5;
    f *= 2.1;
  }
  return v; // Approximately -1.9 to +1.9.
}

// Ground height at position (x, z).
function heightAt(x: number, z: number) {
  const f = fbm(x, z);
  const ridge = 1 - Math.min(Math.abs(f) / 1.9, 1); // Ridge line (0..1).
  const side = MathUtils.smoothstep(Math.abs(x), 7, 38); // Flat center path (0), mountains on both sides (1).
  const h = Math.pow(ridge, 2.4) * 55 + f * 4;
  return Math.max(0, h) * side;
}

// ======================================================
// 1) TERRAIN: mountains with height-based colors (grass → rock → snow).
// ======================================================
function Terrain({ lowEnd }: { lowEnd: boolean }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(WIDTH, LEN, lowEnd ? 100 : 180, lowEnd ? 60 : 110);
    g.rotateX(-Math.PI / 2); // Lay the plane flat as ground.

    // Set the height (y) of each vertex.
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    }
    g.computeVertexNormals(); // Recalculate normals for lighting.

    // Set vertex colors based on height and slope.
    const nor = g.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    const grass = new Color("#56664a");
    const rock = new Color("#6d6a66");
    const snow = new Color("#eef4fb");

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const flat = nor.getY(i); // 1 = flat, 0 = steep.

      c.copy(grass).lerp(rock, MathUtils.smoothstep(y, 1, 12));
      // Snow accumulates only at high elevations and on gentler slopes.
      const snowAmt = MathUtils.smoothstep(y, 18, 28) * MathUtils.smoothstep(flat, 0.45, 0.8);
      c.lerp(snow, snowAmt);

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    return g;
  }, [lowEnd]);

  return (
    <mesh geometry={geometry} position={[0, 0, CENTER_Z]}>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

// ======================================================
// 2) WIND SNOW: snowflakes carried by the wind.
// ======================================================
function WindSnow({ count }: { count: number }) {
  const { geometry, speeds } = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const sp = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (rand(i * 4 + 1) - 0.5) * 80; // x
      arr[i * 3 + 1] = rand(i * 4 + 2) * 28; // y
      arr[i * 3 + 2] = (rand(i * 4 + 3) - 0.5) * LEN; // z
      sp[i] = 4 + rand(i * 4 + 4) * 6; // Individual speed for each flake.
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(arr, 3));
    return { geometry: g, speeds: sp };
  }, [count]);

  useFrame(({ clock }, delta) => {
    const attr = geometry.attributes.position as BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      arr[i * 3] += speeds[i] * delta; // Wind moves flakes to the right (+x).
      arr[i * 3 + 1] -= delta * 0.8; // Slowly drift downward.
      arr[i * 3 + 1] += Math.sin(t * 1.3 + i) * delta * 0.6; // Sway from side to side.

      if (arr[i * 3] > 40) arr[i * 3] = -40; // Wrap to the left when a flake exits on the right.
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 28; // Reset above the ground when a flake reaches it.
    }
    attr.needsUpdate = true;
  });

  return (
    <points geometry={geometry} position={[0, 0, CENTER_Z]} frustumCulled={false}>
      <pointsMaterial
        color="#ffffff"
        size={0.14}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

// ======================================================
// Mountain World (assembled scene).
// ======================================================
export default function MountainWorld({ lowEnd }: { lowEnd: boolean }) {
  return (
    <>
      {/* Light comes from behind the camera, illuminating the mountains ahead. */}
      <ambientLight intensity={0.7} color="#cfe0f5" />
      <directionalLight position={[30, 50, 40]} intensity={2.2} color="#fff3e0" />

      <Terrain lowEnd={lowEnd} />
      <WindSnow count={lowEnd ? 500 : 1800} />
    </>
  );
}