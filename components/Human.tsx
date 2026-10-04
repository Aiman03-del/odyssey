"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useFBX } from "@react-three/drei";
import { Bone, Box3, Group, MathUtils, Mesh, Vector3 } from "three";

// ---------- সেটিংস (দরকারে এখানে বদলাও) ----------
const HEIGHT = 1.8; // human এর উচ্চতা (unit)
const FLIP = 0; // character উল্টো দিকে মুখ করলে 0 এর বদলে Math.PI দাও

// float.fbx খালি হলে swim কে এই গতিতে চালিয়ে ভাসার মতো দেখাই (1 = স্বাভাবিক)
const FLOAT_SPEED = 0.3;

// Camera কোন গভীরতায় (depth) গেলে কোন animation চলবে
// (দুটো জায়গাই transition এর পর্দার আড়ালে, তাই হঠাৎ বদল চোখে পড়বে না)
const SWITCH = { water: 55, mountain: 168 };

// প্রতিটা অবস্থায় human এর উচ্চতা, camera থেকে কত নিচে (ছবি দেখে বদলাতে পারো)
const FLOAT_OFFSET = -0.9; // Space এ ভাসা
const SWIM_OFFSET = -0.6; // পানিতে সাঁতার
const GROUND_Y = 0; // পাহাড়ে মাটির উচ্চতা

type Mode = "float" | "swim" | "walk";

export default function Human() {
  const group = useRef<Group>(null);

  // character (শরীর) আর তিনটা animation file
  const character = useFBX("/models/human.fbx");
  const walkFbx = useFBX("/models/walk.fbx");
  const swimFbx = useFBX("/models/swim.fbx");
  const floatFbx = useFBX("/models/float.fbx");

  // প্রতিটা file থেকে প্রথম animation নিয়ে নাম দিই (Mixamo সবগুলোর নাম দেয় "mixamo.com")
  const clips = useMemo(() => {
    const pick = (src: Group, name: Mode) => {
      const c = src.animations[0]?.clone();
      if (c) c.name = name;
      return c;
    };
    const walk = pick(walkFbx, "walk");
    const swim = pick(swimFbx, "swim");
    let float = pick(floatFbx, "float");

    // float.fbx খালি (0 track) হলে swim এর কপি দিয়ে কাজ চালাই
    if (!float || float.tracks.length === 0) {
      float = swim?.clone();
      if (float) float.name = "float";
    }
    return [walk, swim, float].filter((c) => c !== undefined);
  }, [walkFbx, swimFbx, floatFbx]);

  const { actions } = useAnimations(clips, group);

  // actions কে ref এ রাখি, যাতে useFrame এর ভেতরে নিরাপদে বদলানো যায়
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const mode = useRef<Mode | null>(null); // এখন কোন animation চলছে
  const prevZ = useRef(0);
  const speedSmooth = useRef(0);
  const yNow = useRef(0);

  // Character এর মাপ ঠিক করি: উচ্চতা ১.৮, পা মাটিতে, মাঝখানে
  // (Mixamo এর মাপ আলাদা হতে পারে, তাই নিজে হিসাব করি)
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(character);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const s = size.y > 0 ? HEIGHT / size.y : 1;
    return { s, x: -center.x * s, y: -box.min.y * s, z: -center.z * s };
  }, [character]);

  useEffect(() => {
    // কোনো animation ঠিকমতো না এলে এখানে দেখা যাবে (F12 → Console)
    console.log(
      "Clips:",
      clips.map((c) => `${c.name}: ${c.tracks.length} tracks, ${c.duration.toFixed(1)}s`)
    );
    // হাড়ের নাম ও animation এর track এর নাম মেলে কিনা দেখার জন্য
    const bones: string[] = [];
    character.traverse((o) => {
      if ((o as Mesh).isMesh) o.frustumCulled = false; // skinned mesh লুকিয়ে যাওয়া ঠেকাতে
      if ((o as Bone).isBone) bones.push(o.name);
    });
    console.log("Bones:", bones.length, bones.slice(0, 4));
    console.log("Track sample:", clips[0]?.tracks.slice(0, 3).map((t) => t.name));
  }, [clips, character]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;

    const acts = actionsRef.current;
    const t = state.clock.elapsedTime;
    const cam = state.camera.position;
    const depth = -cam.z;

    // ১) কোন অবস্থায় আছি
    const next: Mode = depth < SWITCH.water ? "float" : depth < SWITCH.mountain ? "swim" : "walk";

    // ২) Animation বদল (০.৬ সেকেন্ড ধরে নরমভাবে মিশে যায়)
    if (next !== mode.current && acts[next]) {
      const prevAct = mode.current ? acts[mode.current] : null;
      acts[next]?.reset().fadeIn(0.6).play();
      prevAct?.fadeOut(0.6);
      mode.current = next;
    }

    // ৩) Scroll এর গতি (camera প্রতি সেকেন্ডে কত unit এগোচ্ছে), নরম করে
    const raw = Math.abs(cam.z - prevZ.current) / Math.max(delta, 0.001);
    prevZ.current = cam.z;
    speedSmooth.current = MathUtils.damp(speedSmooth.current, raw, 6, delta);
    const speed = speedSmooth.current;

    // ৪) Animation এর গতি scroll এর সাথে মেলাই
    const act = mode.current ? acts[mode.current] : null;
    if (act) {
      if (mode.current === "walk") act.timeScale = MathUtils.clamp(speed / 2.5, 0, 1.6); // থামলে পা থামে
      else if (mode.current === "swim") act.timeScale = MathUtils.clamp(0.4 + speed / 4, 0.4, 1.6); // থামলেও আস্তে সাঁতার
      else act.timeScale = FLOAT_SPEED; // ভাসা সবসময় একই, ধীর গতিতে
    }

    // ৫) অবস্থান: camera র সামনে ৪ unit, উচ্চতা অবস্থা অনুযায়ী (নরমভাবে বদলায়)
    const targetY =
      mode.current === "walk"
        ? GROUND_Y
        : cam.y + (mode.current === "swim" ? SWIM_OFFSET : FLOAT_OFFSET);
    yNow.current = MathUtils.damp(yNow.current, targetY, 3, delta);
    g.position.set(cam.x, yNow.current, cam.z - 4);

    // ৬) মুখ camera র উল্টো দিকে (সামনে এগোচ্ছে), ভাসার সময় একটু দুলুনি
    const sway = mode.current === "float" ? Math.sin(t * 0.4) * 0.5 : 0;
    g.rotation.set(0, FLIP + Math.PI + sway, 0);
  });

  return (
    <group ref={group}>
      <group position={[fit.x, fit.y, fit.z]} scale={fit.s}>
        <primitive object={character} />
      </group>
    </group>
  );
}