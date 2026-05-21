"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  Environment,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";

/**
 * Loads the .glb and reports back when it's ready so the parent can hide
 * the shimmer overlay.
 *
 * useGLTF caches by URL; each Meshy job has its own model id (unique URL),
 * so caches don't collide between drafts. We clear on unmount to keep
 * memory tight if the user generates many drafts in one session.
 */
function Model({ src, onLoaded }: { src: string; onLoaded: () => void }) {
  const { scene } = useGLTF(src);
  useEffect(() => {
    onLoaded();
    return () => {
      try {
        useGLTF.clear(src);
      } catch {
        /* noop */
      }
    };
  }, [src, onLoaded]);
  return <primitive object={scene} />;
}

function ShimmerPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ivory-100/60">
      <div className="w-2/3 h-2/3 rounded-sm shimmer border border-bone-300" />
    </div>
  );
}

export function ModelViewer({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  // Reset when src changes — viewing a new draft means a fresh load.
  useEffect(() => setLoaded(false), [src]);

  return (
    <div className="relative w-full h-[480px] rounded-sm overflow-hidden border border-bone-300 bg-ivory-100/30">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 2.5], fov: 35 }}
      >
        {/* Soft warm key + cool fill reads metallics nicely. */}
        <ambientLight intensity={0.25} />
        <directionalLight position={[3, 5, 3]} intensity={0.6} castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.6} />

        <Suspense fallback={null}>
          {/* Studio HDR is critical for gold/silver reflections. */}
          <Environment preset="studio" />
          <Bounds fit clip observe margin={1.2}>
            <Model src={src} onLoaded={() => setLoaded(true)} />
          </Bounds>
        </Suspense>

        <OrbitControls
          enablePan={false}
          minDistance={1.2}
          maxDistance={5}
          autoRotate
          autoRotateSpeed={0.4}
        />
      </Canvas>

      {!loaded && <ShimmerPlaceholder />}

      {/* Hairline along the bottom for editorial framing. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-400/40 to-transparent" />
    </div>
  );
}
