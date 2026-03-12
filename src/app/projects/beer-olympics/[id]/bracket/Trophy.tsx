"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment, Float } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

function TrophyModel() {
  const { scene } = useGLTF("/models/trophy.glb");
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
      <group ref={ref}>
        <primitive object={scene} scale={1.5} position={[0, -0.5, 0]} />
      </group>
    </Float>
  );
}

export default function TrophyScene() {
  return (
    <Canvas camera={{ position: [0, 1, 3], fov: 45 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <directionalLight position={[-3, 3, -3]} intensity={0.4} />
      <TrophyModel />
      <Environment preset="city" />
    </Canvas>
  );
}

useGLTF.preload("/models/trophy.glb");
