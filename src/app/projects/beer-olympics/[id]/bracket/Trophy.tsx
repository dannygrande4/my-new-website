"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment, Float, Center } from "@react-three/drei";
import { useRef, useEffect, Component, type ReactNode } from "react";
import * as THREE from "three";

class TrophyErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center text-4xl">
          🏆
        </div>
      );
    }
    return this.props.children;
  }
}

function TrophyModel() {
  const { scene } = useGLTF("/models/trophy.glb");
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <Center>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
        <group ref={ref}>
          <primitive object={scene} scale={1.2} />
        </group>
      </Float>
    </Center>
  );
}

export default function TrophyScene() {
  return (
    <TrophyErrorBoundary>
      <Canvas camera={{ position: [0, 0, 6], fov: 30 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <directionalLight position={[-3, 3, -3]} intensity={0.4} />
        <TrophyModel />
        <Environment preset="city" />
      </Canvas>
    </TrophyErrorBoundary>
  );
}

useGLTF.preload("/models/trophy.glb");
