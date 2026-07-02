"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Center } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

const MODEL = "/models/astronaut.glb";

// Tweakables.
const TARGET_HEIGHT = 1.6; // world units tall
const FACE_ROT_Y = 0; // base Y rotation (radians) for his starting facing
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

type Ripple = { x: number; y: number; seq: number };

function Astronaut({ rippleRef }: { rippleRef: MutableRefObject<Ripple> }) {
  const posRef = useRef<THREE.Group>(null);
  const swayRef = useRef<THREE.Group>(null);
  const impulse = useRef(new THREE.Vector3()); // linear push velocity
  const angVel = useRef(new THREE.Vector3()); // shockwave spin velocity
  const { viewport, camera, size } = useThree();
  const { scene } = useGLTF(MODEL);

  const { model, fitScale } = useMemo(() => {
    const c = scene.clone(true);
    // Meshy exports the suit fully metallic (metalness=1); with no env map that
    // renders black, so drop metalness and let the fixed key light read the albedo.
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        const sm = m as THREE.MeshStandardMaterial;
        if (sm.metalness !== undefined) sm.metalness = 0.25;
        if (sm.roughness !== undefined) sm.roughness = 0.6;
        sm.needsUpdate = true;
      });
    });
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const fitScale = TARGET_HEIGHT / (size.y || 1);
    return { model: c, fitScale };
  }, [scene]);

  // Click anywhere → shockwave: push him away + spin him, and fire the ripple.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const pos = posRef.current;
      if (!pos) return;
      // Screen point → world position on the z=0 plane he drifts on.
      const ndcX = (e.clientX / size.width) * 2 - 1;
      const ndcY = -(e.clientY / size.height) * 2 + 1;
      const ray = new THREE.Vector3(ndcX, ndcY, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      const dist = -camera.position.z / ray.z;
      const click = camera.position.clone().add(ray.multiplyScalar(dist));

      // Fire the ripple at the click point.
      rippleRef.current.x = click.x;
      rippleRef.current.y = click.y;
      rippleRef.current.seq += 1;

      const dx = pos.position.x - click.x;
      const dy = pos.position.y - click.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      // Closer click → bigger push.
      const force = SHOCKWAVE_FORCE / (d * 0.5 + 0.35);

      // Linear push away from the click.
      impulse.current.x += nx * force;
      impulse.current.y += ny * force;
      if (impulse.current.length() > MAX_IMPULSE_SPEED) {
        impulse.current.setLength(MAX_IMPULSE_SPEED);
      }

      // Spin on the axes that match the push direction: a vertical shove tumbles
      // him about X, a horizontal shove turns him about Y, plus a little twist.
      const kick = force * SPIN_KICK;
      const av = angVel.current;
      av.x += ny * kick;
      av.y += nx * kick;
      av.z += (nx - ny) * kick * 0.25;
      if (av.length() > MAX_SPIN) av.setLength(MAX_SPIN);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [camera, size, rippleRef]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const pos = posRef.current;
    const sway = swayRef.current;
    if (!pos || !sway) return;

    // Base meandering drift — the heading slowly wanders in every direction.
    const heading = Math.sin(t * 0.043) * 1.3 + Math.sin(t * 0.017) * 1.0;
    pos.position.x += delta * DRIFT_SPEED * Math.cos(heading);
    pos.position.y += delta * DRIFT_SPEED * Math.sin(heading);

    // Shockwave push (speed-capped), decaying back to the drift over time.
    const imp = impulse.current;
    if (imp.lengthSq() > MAX_IMPULSE_SPEED * MAX_IMPULSE_SPEED) {
      imp.setLength(MAX_IMPULSE_SPEED);
    }
    pos.position.x += imp.x * delta;
    pos.position.y += imp.y * delta;
    imp.multiplyScalar(Math.exp(-IMPULSE_DAMPING * delta));

    // Continuous toroidal wrap — small margin so he's barely off-screen.
    const halfW = viewport.width / 2 + WRAP_MARGIN;
    const halfH = viewport.height / 2 + WRAP_MARGIN;
    if (pos.position.x > halfW) pos.position.x = -halfW;
    else if (pos.position.x < -halfW) pos.position.x = halfW;
    if (pos.position.y > halfH) pos.position.y = -halfH;
    else if (pos.position.y < -halfH) pos.position.y = halfH;

    // Slow drift tumble + decaying shockwave spin (accumulated, so they add).
    const av = angVel.current;
    if (av.lengthSq() > MAX_SPIN * MAX_SPIN) av.setLength(MAX_SPIN);
    sway.rotation.x += (SPIN_SPEED_X + av.x) * delta;
    sway.rotation.y += (SPIN_SPEED_Y + av.y) * delta;
    sway.rotation.z += av.z * delta;
    av.multiplyScalar(Math.exp(-SPIN_DAMPING * delta));
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

// Expanding ring that fades out at each click point.
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
      const p = age / DUR; // 0 → 1
      mesh.visible = true;
      mesh.scale.setScalar(0.6 + p * 0.5); // small, barely expands
      mat.opacity = (1 - p) * 0.13; // very faint
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
      <RippleRing rippleRef={rippleRef} />
      <Suspense fallback={null}>
        <Astronaut rippleRef={rippleRef} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(MODEL);
