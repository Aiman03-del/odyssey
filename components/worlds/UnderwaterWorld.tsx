"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ---------- সাধারণ constants ----------
const SURFACE_Y = 14; // পানির উপরের তল
const FLOOR_Y = -14; // সমুদ্রতলের গড় উচ্চতা
const HALF_LEN = 55; // world এর অর্ধেক দৈর্ঘ্য (z দিকে)

// নির্দিষ্ট "random" সংখ্যা (প্রতিবার একই থাকে)
const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

// সমুদ্রতলের টিলার উচ্চতা (প্রায় -২ থেকে +২)
// সমুদ্রতল, পাথর আর kelp সবাই এই এক হিসাব ব্যবহার করে, তাই সব মাটিতে ঠিকমতো বসে
function heightAt(x: number, z: number) {
  return (
    Math.sin(x * 0.12 + z * 0.07) * 0.9 +
    Math.sin(x * 0.05 - z * 0.11) * 1.2 +
    Math.sin(x * 0.3 + z * 0.25) * 0.15
  );
}

// ======================================================
// 1) WAVE SHADER: পানির surface (নিচ থেকে দেখা যায়)
// ======================================================
const surfaceVertex = /* glsl */ `
  uniform float uTime;
  varying float vHeight;
  varying vec2 vUv;
  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    vec3 pos = position;
    float h = sin(pos.x * 0.30 + uTime * 0.8) * 0.5
            + sin(pos.y * 0.40 + uTime * 1.1) * 0.4
            + sin((pos.x + pos.y) * 0.20 + uTime * 0.5) * 0.6;
    pos.z += h;
    vHeight = h;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const surfaceFragment = /* glsl */ `
  uniform float uTime;
  varying float vHeight;
  varying vec2 vUv;
  #include <fog_pars_fragment>

  void main() {
    vec3 deep = vec3(0.03, 0.22, 0.38);
    vec3 bright = vec3(0.40, 0.78, 0.95);
    vec3 col = mix(deep, bright, smoothstep(-1.0, 1.5, vHeight));
    float sparkle = pow(max(sin(vUv.x * 120.0 + uTime) * sin(vUv.y * 120.0 - uTime * 1.3), 0.0), 8.0);
    col += sparkle * 0.3;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

function WaterSurface() {
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
    []
  );
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={[0, SURFACE_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[140, 140, 96, 96]} />
      <shaderMaterial
        ref={mat}
        vertexShader={surfaceVertex}
        fragmentShader={surfaceFragment}
        uniforms={uniforms}
        fog={true}
        side={DoubleSide}
      />
    </mesh>
  );
}

// ======================================================
// 2) SEABED: বালির তল (টিলা + বালির ঢেউয়ের রঙ)
// ======================================================
function useSeabedGeometry(lowEnd: boolean) {
  return useMemo(() => {
    const seg = lowEnd ? 70 : 130;
    const g = new PlaneGeometry(140, 140, seg, seg);
    g.rotateX(-Math.PI / 2); // plane কে মাটির মতো শুইয়ে দিই

    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sandA = new Color("#8d8160");
    const sandB = new Color("#b0a37c");
    const dark = new Color("#5d5642");
    const c = new Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, FLOOR_Y + h);

      // বালির ঢেউয়ের দাগ + টিলার মাথা হালকা, গর্ত গাঢ়
      const ripple = 0.5 + 0.5 * Math.sin(x * 1.2 + Math.sin(z * 0.35) * 2.0 + z * 0.5);
      c.copy(sandA).lerp(sandB, ripple * 0.6 + MathUtils.clamp((h + 1.5) / 3, 0, 1) * 0.4);
      c.lerp(dark, MathUtils.smoothstep(-h, 0.5, 2.2) * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [lowEnd]);
}

function Seabed({ geometry }: { geometry: BufferGeometry }) {
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

// ======================================================
// 3) CAUSTICS: সমুদ্রতলে আলোর জালের নকশা (ঢেউ থেকে আসা আলো)
// ======================================================
const causticsVertex = /* glsl */ `
  varying vec2 vXZ;
  varying float vDist;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vXZ = wp.xz;
    vDist = distance(cameraPosition, wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const causticsFragment = (iter: number) => /* glsl */ `
  #define ITER ${iter}
  uniform float uTime;
  varying vec2 vXZ;
  varying float vDist;

  // জনপ্রিয় "tileable water caustic" পদ্ধতির সংক্ষিপ্ত রূপ
  float caustic(vec2 xz, float time) {
    vec2 p = xz * 1.2 - 250.0;
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < ITER; n++) {
      float t = time * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
    }
    c /= float(ITER);
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }

  void main() {
    float c = caustic(vXZ, uTime * 0.5 + 23.0);
    float fade = exp(-pow(vDist * 0.032, 2.0)); // দূরে ফিকে হয়ে যায়
    gl_FragColor = vec4(vec3(0.4, 0.8, 1.0) * c * 0.9 * fade, 1.0);
  }
`;

// সমুদ্রতলের ঠিক উপরে (একই আকার) যোগ হওয়া আলোর স্তর
function Caustics({ geometry, lowEnd }: { geometry: BufferGeometry; lowEnd: boolean }) {
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const fragment = useMemo(() => causticsFragment(lowEnd ? 3 : 5), [lowEnd]);

  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh geometry={geometry} position={[0, 0.04, 0]}>
      <shaderMaterial
        ref={mat}
        vertexShader={causticsVertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}

// ======================================================
// 4) ROCKS: এবড়োখেবড়ো কিন্তু মসৃণ পাথর
// ======================================================
const ROCKS: [number, number, number][] = [
  [-8, -30, 2.5],
  [10, -10, 3],
  [-12, 15, 4],
  [7, 35, 2.2],
  [-5, -45, 3.5],
  [12, 45, 3],
  [-18, -5, 2],
  [16, 25, 2.6],
];

function Rocks() {
  const geometry = useMemo(() => {
    let g: BufferGeometry = new IcosahedronGeometry(1, 3);
    // শীর্ষবিন্দু জুড়ে নেওয়ার আগে normal/uv সরাতে হয়, নইলে মেলে না
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g = mergeVertices(g);

    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const s =
        1 +
        0.18 * Math.sin(x * 3.1 + z * 2.3) +
        0.12 * Math.sin(y * 4.7 + x * 1.9) +
        0.08 * Math.sin(z * 7.0 + y * 5.0);
      p.setXYZ(i, x * s, y * s, z * s);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <group>
      {ROCKS.map(([x, z, s], i) => (
        <mesh
          key={i}
          geometry={geometry}
          position={[x, FLOOR_Y + heightAt(x, z) + s * 0.15, z]}
          rotation={[0, rand(i + 1) * 6, 0]}
          scale={[s, s * 0.6, s * (0.8 + rand(i + 9) * 0.4)]}
        >
          <meshStandardMaterial color="#4a5154" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

// ======================================================
// 5) KELP: স্রোতে দুলতে থাকা লম্বা আগাছা (InstancedMesh)
// ======================================================
const kelpVertex = /* glsl */ `
  uniform float uTime;
  varying float vH;
  #include <fog_pars_vertex>

  void main() {
    vH = uv.y;
    vec3 p = position;
    p.x *= (1.0 - uv.y * 0.75); // ডগার দিকে সরু

    // প্রতিটা গাছের নিজস্ব দোলার ছন্দ (গোড়ার অবস্থান থেকে)
    vec4 base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float ph = base.x * 0.4 + base.z * 0.3;
    float sway = sin(uTime * 1.1 + ph + uv.y * 2.5) * 0.45
               + sin(uTime * 1.9 + ph * 1.7 + uv.y * 4.0) * 0.15;
    p.x += sway * uv.y * uv.y * 1.6;
    p.z += cos(uTime * 0.9 + ph) * 0.25 * uv.y * uv.y;

    vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const kelpFragment = /* glsl */ `
  varying float vH;
  #include <fog_pars_fragment>

  void main() {
    vec3 baseCol = vec3(0.04, 0.10, 0.05);
    vec3 tipCol = vec3(0.30, 0.48, 0.16);
    vec3 col = mix(baseCol, tipCol, smoothstep(0.0, 1.0, vH));
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

function Kelp({ count }: { count: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
    []
  );

  // এক টুকরো পাতা: নিচ (y=0) থেকে উপরে (y=1), ৮ ভাগে ভাঙা যাতে বাঁকতে পারে
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(0.5, 1, 1, 8);
    g.translate(0, 0.5, 0);
    return g;
  }, []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      // কিছু গাছ গুচ্ছ বেঁধে থাকে: ৩ টা করে কাছাকাছি
      const cluster = Math.floor(i / 3);
      const cx = (rand(cluster * 5 + 1) - 0.5) * 50;
      const cz = (rand(cluster * 5 + 2) - 0.5) * 2 * (HALF_LEN - 5);
      const x = cx + (rand(i * 7 + 3) - 0.5) * 2.5;
      const z = cz + (rand(i * 7 + 4) - 0.5) * 2.5;
      dummy.position.set(x, FLOOR_Y + heightAt(x, z) - 0.1, z);
      dummy.rotation.set(0, rand(i * 7 + 5) * Math.PI, 0);
      dummy.scale.set(1, 3 + rand(i * 7 + 6) * 6, 1); // উচ্চতা ৩–৯
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count]);

  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={kelpVertex}
        fragmentShader={kelpFragment}
        uniforms={uniforms}
        fog={true}
        side={DoubleSide}
      />
    </instancedMesh>
  );
}

// ======================================================
// 6) FISH: মাছের ঝাঁক (বৃত্তাকারে ঘোরে, নিজের দিকে মুখ করে)
// ======================================================
const SCHOOLS = [
  { c: [7, -2, -20] as const, R: 9, w: 0.35, phase: 0 },
  { c: [-8, 3, 10] as const, R: 10, w: -0.28, phase: 2 },
  { c: [5, 0, 35] as const, R: 8, w: 0.4, phase: 4 },
];

function Fish({ perSchool }: { perSchool: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const total = SCHOOLS.length * perSchool;

  // প্রতিটা মাছের ঝাঁকের ভেতরের অবস্থান, মাপ আর নিজস্ব ছন্দ
  const offs = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => ({
        x: (rand(i * 6 + 1) - 0.5) * 4.4,
        y: (rand(i * 6 + 2) - 0.5) * 2.4,
        z: (rand(i * 6 + 3) - 0.5) * 4.4,
        s: 0.4 + rand(i * 6 + 4) * 0.3,
        ph: rand(i * 6 + 5) * 6.28,
      })),
    [total]
  );

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    let k = 0;

    for (const sc of SCHOOLS) {
      const a = t * sc.w + sc.phase;
      const cx = sc.c[0] + Math.cos(a) * sc.R;
      const cy = sc.c[1] + Math.sin(a * 0.6) * 1.5;
      const cz = sc.c[2] + Math.sin(a) * sc.R;
      // মাছ যেদিকে এগোচ্ছে সেদিকে মুখ (বৃত্তের স্পর্শক)
      const dir = sc.w > 0 ? 1 : -1;
      const yaw = Math.atan2(-Math.cos(a) * dir, -Math.sin(a) * dir);

      for (let i = 0; i < perSchool; i++, k++) {
        const o = offs[k];
        const wob = Math.sin(t * 3 + o.ph); // লেজ নাড়ার ভঙ্গি
        dummy.position.set(
          cx + o.x + Math.sin(t * 0.8 + o.ph) * 0.4,
          cy + o.y + Math.sin(t * 1.1 + o.ph * 2) * 0.3,
          cz + o.z + Math.cos(t * 0.7 + o.ph) * 0.4
        );
        dummy.rotation.set(0, yaw + wob * 0.12, wob * 0.05);
        dummy.scale.set(o.s, o.s * 0.38, o.s * 0.2);
        dummy.updateMatrix();
        m.setMatrixAt(k, dummy.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, total]} frustumCulled={false}>
      <sphereGeometry args={[0.5, 10, 8]} />
      <meshStandardMaterial color="#c4d9e6" roughness={0.5} metalness={0.1} />
    </instancedMesh>
  );
}

// ======================================================
// 7) GOD RAYS: সমান্তরাল আলোর ফালি (সূর্য একটাই, তাই কোণও একই)
// ======================================================
const rayVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z; // camera থেকে দূরত্ব
    gl_Position = projectionMatrix * mv;
  }
`;

const rayFragment = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  varying float vDist;

  float n(float x) { return sin(x) * 0.5 + 0.5; }

  void main() {
    float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x); // পাশ নরম
    // রশ্মির ভেতরের ডোরা, যা ধীরে নড়ে
    float streak = 0.55 + 0.45 * n(vUv.x * 23.0 + uTime * 0.4 + uPhase) * n(vUv.x * 9.0 - uTime * 0.25);
    float top = pow(vUv.y, 2.2);                                   // উপরে উজ্জ্বল, নিচে মিলিয়ে যায়
    float flicker = 0.75 + 0.25 * sin(uTime * 0.7 + uPhase);
    float far = exp(-pow(vDist * 0.025, 2.0));                     // দূরে ফিকে
    float near = smoothstep(1.5, 7.0, vDist);                      // camera র খুব কাছে ফিকে
    float a = edge * streak * top * flicker * far * near * 0.2;
    gl_FragColor = vec4(vec3(0.55, 0.88, 1.0), a);
  }
`;

const RAY_TILT = 0.28; // সব রশ্মির একই কোণ

function Ray({
  position,
  width,
  rotY,
  phase,
}: {
  position: [number, number, number];
  width: number;
  rotY: number;
  phase: number;
}) {
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uPhase: { value: phase } }),
    [phase]
  );
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={position} rotation={[0, rotY, RAY_TILT]}>
      <planeGeometry args={[width, SURFACE_Y - FLOOR_Y]} />
      <shaderMaterial
        ref={mat}
        vertexShader={rayVertex}
        fragmentShader={rayFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        side={DoubleSide}
      />
    </mesh>
  );
}

function LightRays({ count }: { count: number }) {
  const rays = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        position: [
          (rand(i * 5 + 1) - 0.5) * 36,
          0,
          (rand(i * 5 + 2) - 0.5) * 2 * HALF_LEN,
        ] as [number, number, number],
        width: 3 + rand(i * 5 + 3) * 5,
        rotY: rand(i * 5 + 4) * Math.PI,
        phase: rand(i * 5 + 5) * 6.28,
      })),
    [count]
  );
  return (
    <group>
      {rays.map((r, i) => (
        <Ray key={i} {...r} />
      ))}
    </group>
  );
}

// ======================================================
// 8) BUBBLES: InstancedMesh (একটাই draw call)
// ======================================================
function Bubbles({ count }: { count: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const data = useMemo(() => {
    const d = {
      x: new Float32Array(count),
      y: new Float32Array(count),
      z: new Float32Array(count),
      speed: new Float32Array(count),
      size: new Float32Array(count),
      phase: new Float32Array(count),
    };
    for (let i = 0; i < count; i++) {
      d.x[i] = (rand(i * 6 + 1) - 0.5) * 20;
      d.y[i] = (rand(i * 6 + 2) - 0.5) * 26;
      d.z[i] = (rand(i * 6 + 3) - 0.5) * 2 * HALF_LEN;
      d.speed[i] = 0.6 + rand(i * 6 + 4) * 1.4;
      d.size[i] = 0.03 + rand(i * 6 + 5) * 0.09;
      d.phase[i] = rand(i * 6 + 6) * 6.28;
    }
    return d;
  }, [count]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const height = SURFACE_Y - FLOOR_Y - 2;
    for (let i = 0; i < count; i++) {
      const y =
        FLOOR_Y +
        1 +
        ((data.y[i] - (FLOOR_Y + 1) + data.speed[i] * t) % height);
      dummy.position.set(
        data.x[i] + Math.sin(t * 1.5 + data.phase[i]) * 0.3,
        y,
        data.z[i] + Math.cos(t * 1.2 + data.phase[i]) * 0.3
      );
      dummy.scale.setScalar(data.size[i]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial color="#cfeeff" transparent opacity={0.4} depthWrite={false} />
    </instancedMesh>
  );
}

// ======================================================
// Underwater World (সব জোড়া লাগানো)
// ======================================================
export default function UnderwaterWorld({ lowEnd }: { lowEnd: boolean }) {
  const seabed = useSeabedGeometry(lowEnd);

  return (
    <>
      {/* আলো: উপর থেকে নীলচে আলো */}
      <ambientLight intensity={0.35} color="#4f95c4" />
      <directionalLight position={[-6, 20, 0]} intensity={2.0} color="#b6e6ff" />

      {/* Space-এর শেষে (z = -110) এই world বসে, দৈর্ঘ্য ±55 */}
      <group position={[0, 0, -110]}>
        <WaterSurface />
        <Seabed geometry={seabed} />
        <Caustics geometry={seabed} lowEnd={lowEnd} />
        <Rocks />
        <Kelp count={lowEnd ? 60 : 150} />
        <Fish perSchool={lowEnd ? 14 : 36} />
        <LightRays count={lowEnd ? 6 : 10} />

        {/* Marine snow: পানিতে ভাসমান ক্ষুদ্র কণা */}
        <Sparkles
          scale={[40, 26, 110]}
          count={lowEnd ? 150 : 400}
          size={2}
          speed={0.12}
          opacity={0.45}
          color="#cfe8f5"
        />

        <Bubbles count={lowEnd ? 60 : 160} />
      </group>
    </>
  );
}
