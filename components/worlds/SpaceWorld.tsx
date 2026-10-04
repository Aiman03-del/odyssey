"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard, Stars } from "@react-three/drei";
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  Object3D,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from "three";

type Vec3 = [number, number, number];

// ---------- অবস্থান ----------
const EARTH: Vec3 = [-6, -1, -12];
const MARS: Vec3 = [7, 2, -30];
const SATURN: Vec3 = [-14, 4, -48];
// দৃশ্যমান সূর্য (শুধু দেখার জন্য, শেষের দিকে সামনে দেখা যায়)
const SUN_POS: Vec3 = [24, 9, -90];
// আলোর উৎস: ডান পাশ থেকে (cinematic), তাই গ্রহগুলো অর্ধেক আলোকিত দেখায়
const LIGHT_ARR: Vec3 = [36, 14, -4];
const LIGHT_POS = new Vector3(...LIGHT_ARR);
const SHELL = 1.12; // atmosphere কত গুণ বড়

// গ্রহ থেকে আলোর দিকে একক vector
const lightDir = (p: Vec3) => LIGHT_POS.clone().sub(new Vector3(...p)).normalize();

// নির্দিষ্ট "random" সংখ্যা (প্রতিবার একই থাকে)
const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const hash3 = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// ======================================================
// Texture লোড করার hook: file না থাকলে crash করে না, null দেয়
// ======================================================
function useOptionalTexture(url: string, srgb = true) {
  const gl = useThree((s) => s.gl);
  const [tex, setTex] = useState<Texture | null>(null);

  useEffect(() => {
    let alive = true;
    new TextureLoader().load(
      url,
      (t) => {
        if (!alive) return;
        if (srgb) t.colorSpace = SRGBColorSpace;
        t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        setTex(t);
      },
      undefined,
      () => console.warn("Texture পাওয়া যায়নি:", url)
    );
    return () => {
      alive = false;
    };
  }, [url, srgb, gl]);

  return tex;
}

// ======================================================
// 1) MILKY WAY: আকাশের পটভূমি (আসল ছবি, camera কে ঘিরে থাকে)
// ======================================================
function MilkyWay() {
  const ref = useRef<Mesh>(null);
  const tex = useOptionalTexture("/textures/milkyway.jpg");

  // ভেতর থেকে দেখার জন্য sphere উল্টে দিই (ছবি আয়না-উল্টো হয় না)
  const geometry = useMemo(() => {
    const g = new SphereGeometry(300, 48, 32);
    g.scale(-1, 1, 1);
    return g;
  }, []);

  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });

  if (!tex) return null;
  return (
    <mesh ref={ref} geometry={geometry} renderOrder={-10} frustumCulled={false}>
      <meshBasicMaterial
        map={tex}
        color={[0.55, 0.55, 0.6]} // একটু অন্ধকার রাখি, যাতে গ্রহ আর সূর্য আলাদা ফোটে
        toneMapped={false}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

// ======================================================
// 2) ATMOSPHERE: কিনারায় নরম আলোর ছটা, আলোর দিকে বেশি উজ্জ্বল
// ======================================================
const atmoVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vWN;
  void main() {
    vWN = normalize(mat3(modelMatrix) * normal);
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const atmoFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLight;
  uniform float uStrength;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vWN;
  void main() {
    float f = -dot(normalize(vN), normalize(vV));
    float maxF = sqrt(1.0 - 1.0 / (${SHELL.toFixed(2)} * ${SHELL.toFixed(2)}));
    float a = pow(clamp(f / maxF, 0.0, 1.0), 2.5);
    float lit = smoothstep(-0.3, 0.7, dot(normalize(vWN), uLight));
    gl_FragColor = vec4(uColor, a * uStrength * (0.1 + 0.9 * lit));
  }
`;

function AtmosphereShell({
  radius,
  color,
  light,
  strength,
}: {
  radius: number;
  color: string;
  light: Vector3;
  strength: number;
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(color) },
      uLight: { value: light },
      uStrength: { value: strength },
    }),
    [color, light, strength]
  );
  return (
    <mesh scale={SHELL}>
      <sphereGeometry args={[radius, 48, 48]} />
      <shaderMaterial
        vertexShader={atmoVertex}
        fragmentShader={atmoFragment}
        uniforms={uniforms}
        side={BackSide}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}

// ======================================================
// 3) EARTH: দিনের ছবি + রাতের শহরের আলো + মেঘ
// ======================================================
const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWN;
  void main() {
    vUv = uv;
    vWN = normalize(mat3(modelMatrix) * normal); // world normal (গ্রহ ঘুরলেও আলো ঠিক থাকে)
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec3 vWN;
  void main() {
    vec3 n = normalize(vWN);
    float d = dot(n, normalize(uLight));
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;

    // দিনের আলো: আলোর দিকে যত মুখ, তত উজ্জ্বল
    vec3 lit = day * max(d, 0.0) * 1.25;
    // রাতের শহরের আলো: শুধু অন্ধকার পাশে
    float nightAmt = 1.0 - smoothstep(-0.05, 0.2, d);
    // সন্ধ্যার লালচে আভা (দিন-রাতের সীমানায়)
    float dusk = smoothstep(-0.2, 0.0, d) * (1.0 - smoothstep(0.0, 0.25, d));

    vec3 col = lit + night * nightAmt * 1.6 + vec3(0.9, 0.35, 0.15) * dusk * 0.06 + day * 0.004;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Earth({ lowEnd }: { lowEnd: boolean }) {
  const day = useOptionalTexture("/textures/earth_day.jpg");
  const night = useOptionalTexture("/textures/earth_night.jpg");
  const clouds = useOptionalTexture("/textures/earth_clouds.jpg", false);
  const spin = useRef<Mesh>(null);
  const cloudRef = useRef<Mesh>(null);
  const radius = 3;
  const seg = lowEnd ? 48 : 96;
  const light = useMemo(() => lightDir(EARTH), []);

  const uniforms = useMemo(
    () => ({ uDay: { value: day }, uNight: { value: night }, uLight: { value: light } }),
    [day, night, light]
  );

  // মেঘ গ্রহের চেয়ে একটু দ্রুত ঘোরে
  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.04;
    if (cloudRef.current) cloudRef.current.rotation.y += delta * 0.052;
  });

  return (
    <group position={EARTH}>
      {/* পৃথিবীর অক্ষ ২৩.৫° হেলানো */}
      <group rotation={[0, 0, 0.41]}>
        <mesh ref={spin}>
          <sphereGeometry args={[radius, seg, seg]} />
          {day && night ? (
            <shaderMaterial
              vertexShader={earthVertex}
              fragmentShader={earthFragment}
              uniforms={uniforms}
            />
          ) : (
            <meshStandardMaterial color="#2f6fb5" roughness={0.9} />
          )}
        </mesh>
        {clouds && (
          <mesh ref={cloudRef} scale={1.012}>
            <sphereGeometry args={[radius, seg, seg]} />
            <meshStandardMaterial
              color="#ffffff"
              alphaMap={clouds}
              transparent
              opacity={0.9}
              depthWrite={false}
              roughness={1}
            />
          </mesh>
        )}
      </group>
      <AtmosphereShell radius={radius} color="#5aa8ff" light={light} strength={1} />
    </group>
  );
}

// ======================================================
// 4) RINGS: Saturn এর বলয় (আসল ছবি)
// ======================================================
function Rings({ radius }: { radius: number }) {
  const tex = useOptionalTexture("/textures/saturn_ring.png");
  const inner = radius * 1.2;
  const outer = radius * 2.3;

  // Ring এর UV কে ভেতর→বাইরে সোজা ডোরার মতো সাজাই
  const geometry = useMemo(() => {
    const g = new RingGeometry(inner, outer, 128, 1);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    return g;
  }, [inner, outer]);

  if (!tex) return null;
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2 + 0.45, 0, 0]}>
      <meshBasicMaterial
        map={tex}
        color={[0.9, 0.85, 0.78]}
        transparent
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ======================================================
// 5) সাধারণ PLANET (Mars, Saturn)
// ======================================================
function Planet({
  position,
  radius,
  textureUrl,
  fallbackColor,
  glow,
  glowStrength,
  rotationSpeed,
  ring,
  lowEnd,
}: {
  position: Vec3;
  radius: number;
  textureUrl: string;
  fallbackColor: string;
  glow: string;
  glowStrength: number;
  rotationSpeed: number;
  ring?: boolean;
  lowEnd: boolean;
}) {
  const map = useOptionalTexture(textureUrl);
  const mesh = useRef<Mesh>(null);
  const seg = lowEnd ? 40 : 80;
  const light = useMemo(() => lightDir(position), [position]);

  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.y += delta * rotationSpeed;
  });

  return (
    <group position={position}>
      <mesh ref={mesh}>
        <sphereGeometry args={[radius, seg, seg]} />
        <meshStandardMaterial
          map={map ?? undefined}
          color={map ? "#ffffff" : fallbackColor}
          roughness={1}
        />
      </mesh>
      <AtmosphereShell radius={radius} color={glow} light={light} strength={glowStrength} />
      {ring && <Rings radius={radius} />}
    </group>
  );
}

// ======================================================
// 6) ASTEROID BELT: এবড়োখেবড়ো পাথর, একটাই draw call
// ======================================================
function AsteroidBelt({ count }: { count: number }) {
  const group = useRef<Group>(null);
  const mesh = useRef<InstancedMesh>(null);

  // প্রতিটা শীর্ষবিন্দু এলোমেলো সরিয়ে অসম আকারের পাথর বানাই
  const rockGeo = useMemo(() => {
    const g = new IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const s = 0.7 + 0.6 * hash3(x, y, z);
      p.setXYZ(i, x * s, y * s * 0.8, z * s);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      const ang = rand(i * 7 + 1) * Math.PI * 2;
      const rad = 4.5 + rand(i * 7 + 2) * 12; // camera এর পথ থেকে দূরে
      dummy.position.set(
        Math.cos(ang) * rad,
        Math.sin(ang) * rad * 0.6,
        -18 - rand(i * 7 + 3) * 26
      );
      dummy.rotation.set(rand(i * 7 + 4) * 6, rand(i * 7 + 5) * 6, rand(i * 7 + 6) * 6);
      dummy.scale.setScalar(0.1 + Math.pow(rand(i * 7 + 7), 3) * 0.8);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.z += delta * 0.015;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[rockGeo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial color="#6f655c" flatShading roughness={1} />
      </instancedMesh>
    </group>
  );
}

// ======================================================
// 7) SUN: আসল ছবি + নরম corona
// ======================================================
const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(max(1.0 - d, 0.0), 3.0);
    gl_FragColor = vec4(uColor, a * 0.55);
  }
`;

function Sun() {
  const map = useOptionalTexture("/textures/sun.jpg");
  const uniforms = useMemo(() => ({ uColor: { value: new Color("#ff9a3c") } }), []);
  return (
    <group position={SUN_POS}>
      <mesh>
        <sphereGeometry args={[5, 48, 48]} />
        {/* রঙের মান ১ এর বেশি: তাই Bloom এ জ্বলে ওঠে */}
        <meshBasicMaterial
          map={map ?? undefined}
          color={map ? [2.2, 1.7, 1.0] : [3, 2, 1]}
          toneMapped={false}
        />
      </mesh>
      <Billboard>
        <mesh>
          <planeGeometry args={[60, 60]} />
          <shaderMaterial
            vertexShader={glowVertex}
            fragmentShader={glowFragment}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

// ======================================================
// Space World (সব জোড়া লাগানো)
// ======================================================
export default function SpaceWorld({ lowEnd }: { lowEnd: boolean }) {
  return (
    <group>
      <MilkyWay />
      {/* তীক্ষ্ণ তারা (Milky Way ছবির সাথে মিলে বাস্তব লাগে) */}
      <Stars
        radius={150}
        depth={50}
        count={lowEnd ? 1000 : 2500}
        factor={3}
        saturation={0}
        fade
        speed={0}
      />

      {/* আলো: একটাই কড়া উৎস, ছায়া প্রায় কালো (মহাকাশে বাতাস নেই) */}
      <ambientLight intensity={0.04} color="#8fa6ff" />
      <pointLight position={LIGHT_ARR} intensity={4.2} decay={0} color="#fff6e8" />

      <Earth lowEnd={lowEnd} />
      <Planet
        position={MARS}
        radius={2}
        textureUrl="/textures/mars.jpg"
        fallbackColor="#b5532f"
        glow="#d99a7a"
        glowStrength={0.35}
        rotationSpeed={0.05}
        lowEnd={lowEnd}
      />
      <Planet
        position={SATURN}
        radius={5}
        textureUrl="/textures/saturn.jpg"
        fallbackColor="#c9a36b"
        glow="#e8d3a0"
        glowStrength={0.35}
        rotationSpeed={0.03}
        ring
        lowEnd={lowEnd}
      />

      <AsteroidBelt count={lowEnd ? 80 : 200} />
      <Sun />
    </group>
  );
}