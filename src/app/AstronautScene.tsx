"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Center, Environment, Lightformer, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

const MODEL = "/models/astronaut.glb";

// Tweakables.
const TARGET_HEIGHT = 1.6; // world units tall
const FACE_ROT_Y = 0; // base Y rotation (radians) so his front faces the camera
const SPIN_SPEED_Y = 0.13; // slow continuous Y rotation (rad/s)
const SPIN_SPEED_X = 0.09; // slow continuous X rotation (rad/s) — head-over-heels tumble
const DRIFT_SPEED = 0.6; // base drift, world units/sec
const WRAP_MARGIN = 0.85; // ~his half-height, so he re-enters as he exits (seamless)

// Shockwave.
const SHOCKWAVE_FORCE = 2.2; // click push strength (closer click → bigger)
const MAX_IMPULSE_SPEED = 5; // cap on push speed, world units/sec
const IMPULSE_DAMPING = 2.0; // how fast the push decays back to a drift (per sec)
const SPIN_KICK = 0.5; // how much the push also spins him
const MAX_SPIN = 4; // cap on shockwave spin, rad/sec
const SPIN_DAMPING = 1.4; // how fast the spin settles back to the drift (per sec)

// Procedural limbs: each bone sways continuously; motion intensifies with
// "excitation" (his linear + angular speed), so a shockwave makes him flail.
// amp = idle swing (rad); max = hard clamp so the limb never reaches the body.
const LIMBS: { name: string; amp: number; freq: number; phase: number; max: number }[] = [
  { name: "LeftArm", amp: 0.24, freq: 1.1, phase: 0.0, max: 0.4 },
  { name: "RightArm", amp: 0.24, freq: 1.05, phase: 1.7, max: 0.4 },
  { name: "LeftForeArm", amp: 0.34, freq: 1.4, phase: 0.6, max: 0.55 },
  { name: "RightForeArm", amp: 0.34, freq: 1.35, phase: 2.2, max: 0.55 },
  { name: "LeftUpLeg", amp: 0.18, freq: 0.9, phase: 1.0, max: 0.32 },
  { name: "RightUpLeg", amp: 0.18, freq: 0.95, phase: 2.6, max: 0.32 },
  { name: "LeftLeg", amp: 0.3, freq: 1.2, phase: 0.3, max: 0.5 },
  { name: "RightLeg", amp: 0.3, freq: 1.25, phase: 1.9, max: 0.5 },
  { name: "Spine02", amp: 0.09, freq: 0.7, phase: 0.5, max: 0.16 },
];

const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const clamp = (v: number, m: number) => (v < -m ? -m : v > m ? m : v);

type Ripple = { x: number; y: number; seq: number };
type BoneRef = { bone: THREE.Object3D; bind: THREE.Quaternion; amp: number; freq: number; phase: number; max: number };

function Astronaut({ rippleRef }: { rippleRef: MutableRefObject<Ripple> }) {
  const posRef = useRef<THREE.Group>(null);
  const swayRef = useRef<THREE.Group>(null);
  const impulse = useRef(new THREE.Vector3()); // linear push velocity
  const angVel = useRef(new THREE.Vector3()); // shockwave spin velocity
  const excite = useRef(0); // 0..~1.5 flail intensity
  const { viewport, camera, size } = useThree();
  const { scene } = useGLTF(MODEL);
  const [metalMap, roughMap] = useTexture([
    "/models/astro_metallic.png",
    "/models/astro_roughness.png",
  ]);

  const { model, fitScale, bones } = useMemo(() => {
    // SkeletonUtils.clone keeps the skinned mesh ↔ bone bindings intact.
    const c = skeletonClone(scene) as THREE.Object3D;
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false; // limbs move outside the bind bbox — don't cull
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const sm = m as THREE.MeshStandardMaterial;
          if (!sm) return;
          // Re-attach the PBR maps the rig export dropped so only the visor is
          // glossy/metallic (the suit stays matte via the roughness map).
          for (const tex of [metalMap, roughMap]) {
            tex.flipY = false;
            tex.colorSpace = THREE.NoColorSpace;
            tex.needsUpdate = true;
          }
          sm.metalnessMap = metalMap;
          sm.roughnessMap = roughMap;
          sm.metalness = 1;
          sm.roughness = 1;
          sm.envMapIntensity = 1.3;
          sm.needsUpdate = true;
        });
      }
    });

    const bones: BoneRef[] = [];
    for (const cfg of LIMBS) {
      const bone = c.getObjectByName(cfg.name);
      if (bone) bones.push({ bone, bind: bone.quaternion.clone(), amp: cfg.amp, freq: cfg.freq, phase: cfg.phase, max: cfg.max });
    }

    const box = new THREE.Box3().setFromObject(c);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    const fitScale = TARGET_HEIGHT / (sz.y || 1);
    return { model: c, fitScale, bones };
  }, [scene, metalMap, roughMap]);

  // Click anywhere → shockwave: push him away + spin him, and fire the ripple.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const pos = posRef.current;
      if (!pos) return;
      const ndcX = (e.clientX / size.width) * 2 - 1;
      const ndcY = -(e.clientY / size.height) * 2 + 1;
      const ray = new THREE.Vector3(ndcX, ndcY, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      const dist = -camera.position.z / ray.z;
      const click = camera.position.clone().add(ray.multiplyScalar(dist));

      rippleRef.current.x = click.x;
      rippleRef.current.y = click.y;
      rippleRef.current.seq += 1;

      const dx = pos.position.x - click.x;
      const dy = pos.position.y - click.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      const force = SHOCKWAVE_FORCE / (d * 0.5 + 0.35);

      impulse.current.x += nx * force;
      impulse.current.y += ny * force;
      if (impulse.current.length() > MAX_IMPULSE_SPEED) impulse.current.setLength(MAX_IMPULSE_SPEED);

      const kick = force * SPIN_KICK;
      const av = angVel.current;
      av.x += ny * kick;
      av.y += nx * kick;
      av.z += (nx - ny) * kick * 0.25;
      if (av.length() > MAX_SPIN) av.setLength(MAX_SPIN);

      excite.current = Math.min(1.0, excite.current + 0.5); // shockwave flail burst
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [camera, size, rippleRef]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const pos = posRef.current;
    const sway = swayRef.current;
    if (!pos || !sway) return;

    // Base meandering drift.
    const heading = Math.sin(t * 0.043) * 1.3 + Math.sin(t * 0.017) * 1.0;
    pos.position.x += delta * DRIFT_SPEED * Math.cos(heading);
    pos.position.y += delta * DRIFT_SPEED * Math.sin(heading);

    // Shockwave push (speed-capped), decaying back to the drift.
    const imp = impulse.current;
    if (imp.lengthSq() > MAX_IMPULSE_SPEED * MAX_IMPULSE_SPEED) imp.setLength(MAX_IMPULSE_SPEED);
    pos.position.x += imp.x * delta;
    pos.position.y += imp.y * delta;
    imp.multiplyScalar(Math.exp(-IMPULSE_DAMPING * delta));

    // Toroidal wrap.
    const halfW = viewport.width / 2 + WRAP_MARGIN;
    const halfH = viewport.height / 2 + WRAP_MARGIN;
    if (pos.position.x > halfW) pos.position.x = -halfW;
    else if (pos.position.x < -halfW) pos.position.x = halfW;
    if (pos.position.y > halfH) pos.position.y = -halfH;
    else if (pos.position.y < -halfH) pos.position.y = halfH;

    // Drift tumble + decaying shockwave spin.
    const av = angVel.current;
    if (av.lengthSq() > MAX_SPIN * MAX_SPIN) av.setLength(MAX_SPIN);
    sway.rotation.x += (SPIN_SPEED_X + av.x) * delta;
    sway.rotation.y += (SPIN_SPEED_Y + av.y) * delta;
    sway.rotation.z += av.z * delta;
    av.multiplyScalar(Math.exp(-SPIN_DAMPING * delta));

    // Excitation follows his motion; decays toward a calm idle flail.
    const motion = imp.length() * 0.12 + av.length() * 0.2;
    const target = Math.min(1.0, motion);
    excite.current += (target - excite.current) * Math.min(1, delta * 3);
    const e = excite.current;

    // Procedural limb flail — gentle idle sway, clearly stronger when excited by a
    // shockwave. Every joint is still clamped to its `max` so it can't reach the body.
    for (let i = 0; i < bones.length; i++) {
      const { bone, bind, amp, freq, phase, max } = bones[i];
      const s = t * freq * (1 + e * 0.25) + phase;
      const gain = 1 + e * 1.3;
      const a1 = clamp(amp * gain * Math.sin(s), max);
      const a2 = clamp(amp * 0.3 * gain * Math.sin(s * 1.3 + 0.7), max * 0.5);
      _euler.set(a1, 0, a2, "XYZ");
      _q.setFromEuler(_euler);
      bone.quaternion.copy(bind).multiply(_q);
    }
  });

  return (
    <group ref={posRef} position={[-3, 0, 0]}>
      <group ref={swayRef}>
        <Center>
          <primitive object={model} scale={fitScale} rotation={[0, FACE_ROT_Y, 0]} />
        </Center>
      </group>
    </group>
  );
}

// Small faint ring that expands and fades at each click.
function RippleRing({ rippleRef }: { rippleRef: MutableRefObject<Ripple> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const seen = useRef(0);
  const born = useRef(-999);
  const DUR = 0.45;

  useFrame((state) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    const r = rippleRef.current;
    if (r.seq !== seen.current) {
      seen.current = r.seq;
      born.current = state.clock.elapsedTime;
      mesh.position.set(r.x, r.y, 0);
    }
    const age = state.clock.elapsedTime - born.current;
    if (age >= 0 && age < DUR) {
      const p = age / DUR;
      mesh.visible = true;
      mesh.scale.setScalar(0.6 + p * 0.5);
      mat.opacity = (1 - p) * 0.13;
    } else {
      mesh.visible = false;
    }
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <ringGeometry args={[0.14, 0.17, 48]} />
      <meshBasicMaterial
        ref={matRef}
        color="#adc0ff"
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function AstronautScene() {
  const rippleRef = useRef<Ripple>({ x: 0, y: 0, seq: 0 });
  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 30 }}
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[-5, 5, 6]} intensity={1.7} />
      <directionalLight position={[4, 2, -5]} intensity={0.5} color="#8ea2ff" />
      {/* Light environment (no network) so the metallic visor has something to
          reflect — a bright panel upper-left reads as the visor highlight. */}
      <Environment frames={1} resolution={128}>
        <Lightformer position={[-4, 3, 4]} scale={6} intensity={2.2} color="#ffffff" />
        <Lightformer position={[4, 0, 2]} scale={4} intensity={0.7} color="#9ab0ff" />
      </Environment>
      <RippleRing rippleRef={rippleRef} />
      <Suspense fallback={null}>
        <Astronaut rippleRef={rippleRef} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(MODEL);
