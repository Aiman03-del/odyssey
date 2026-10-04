// ======================================================
// Transition calculations: when and how far the veil closes.
// ======================================================

// Small helper that avoids importing Three.js and keeps the main bundle light.
const smooth = (x: number, min: number, max: number) => {
  const t = Math.min(Math.max((x - min) / (max - min), 0), 1);
  return t * t * (3 - 2 * t);
};

// Shared values for all consumers; avoids React state re-renders.
export const transitionState = {
  veil: 0, // 0 = no veil, 1 = fully closed
  color: "#bfeaff", // Veil color.
  world: "SPACE", // Current world.
};

// Two transitions. Depth is the camera depth (-z).
// fadeIn closes the veil; fadeOut opens it.
const TRANSITIONS = [
  { color: "#bfeaff", fadeIn: [44, 52], fadeOut: [58, 66] }, // Space → Underwater
  { color: "#e6f1fa", fadeIn: [155, 163], fadeOut: [175, 185] }, // Underwater → Mountains
];

// Depth ranges for each world; the veil is fully closed during transitions.
export const VISIBLE = {
  space: { max: 60 },
  water: { min: 50, max: 176 },
  mountain: { min: 161 },
};

// Called by CameraRig on every frame.
export function updateTransition(depth: number): number {
  let veil = 0;
  let color = TRANSITIONS[0].color;

  for (const t of TRANSITIONS) {
    const v =
      smooth(depth, t.fadeIn[0], t.fadeIn[1]) *
      (1 - smooth(depth, t.fadeOut[0], t.fadeOut[1]));
    if (v > veil) {
      veil = v;
      color = t.color;
    }
  }

  transitionState.veil = veil;
  transitionState.color = color;
  transitionState.world = depth < 55 ? "SPACE" : depth < 168 ? "UNDERWATER" : "MOUNTAINS";
  return veil;
}