"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

function ShaderMaterial() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  const uniforms = useRef({
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  });

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    varying vec2 vUv;

    float noise(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 st = vUv;
      
      // Noise distortion
      float n = noise(st * 3.0 + uTime * 0.1);
      st += n * 0.02;
      
      // Mouse influence
      float dist = distance(st, uMouse);
      st += (uMouse - st) * (0.1 / (dist + 0.1));
      
      // Color gradient
      vec3 color1 = vec3(0.0, 0.0, 0.0); // Black
      vec3 color2 = vec3(0.02, 0.02, 0.02); // Dark grey
      vec3 color3 = vec3(0.84, 1.0, 0.0); // Lime
      
      vec3 color = mix(color1, color2, st.y + sin(uTime * 0.5) * 0.2);
      color = mix(color, color3, n * 0.1);
      
      // Scanline effect
      float scanline = sin(st.y * 100.0 + uTime * 2.0) * 0.02;
      color += scanline;
      
      // Vignette
      float vignette = 1.0 - distance(st, vec2(0.5)) * 1.5;
      color *= vignette;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
      />
    </mesh>
  );
}

export default function ShaderBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <div className="w-full h-full">
        <div className="absolute inset-0 bg-canvas" />
      </div>
    </div>
  );
}
