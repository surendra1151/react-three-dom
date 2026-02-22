import { useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ThreeDom, useR3FRegister } from '@react-three-dom/core';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Mode selector
// ---------------------------------------------------------------------------

type DemoMode = 'auto' | 'auto-filter' | 'manual';

// ---------------------------------------------------------------------------
// Scene objects
// ---------------------------------------------------------------------------

function Chair({ manual }: { manual?: boolean }) {
  const ref = useRef<THREE.Mesh>(null!);
  if (manual) useR3FRegister(ref);

  useFrame(({ clock }) => {
    ref.current.position.y = 0.5 + Math.sin(clock.getElapsedTime() * 2) * 0.1;
  });

  return (
    <mesh
      ref={ref}
      position={[0, 0.5, 0]}
      name="Chair"
      userData={{ testId: 'chair-primary' }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}

function Table() {
  return (
    <group name="TableGroup" userData={{ testId: 'table-group' }}>
      <mesh
        position={[2, 0.75, 0]}
        name="Tabletop"
        userData={{ testId: 'table-top' }}
      >
        <boxGeometry args={[2, 0.1, 1]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      {[
        [-0.8, 0.35, -0.4],
        [-0.8, 0.35, 0.4],
        [0.8, 0.35, -0.4],
        [0.8, 0.35, 0.4],
      ].map((pos, i) => (
        <mesh
          key={i}
          position={[2 + pos[0], pos[1], pos[2]]}
          name={`TableLeg${i + 1}`}
          userData={{ testId: `table-leg-${i + 1}` }}
        >
          <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
      ))}
    </group>
  );
}

function Lighting() {
  return (
    <group name="Lighting" userData={{ testId: 'lighting-group' }}>
      <ambientLight intensity={0.4} />
      <directionalLight
        name="SunLight"
        position={[5, 10, 5]}
        intensity={1}
        castShadow
        userData={{ testId: 'sun-light' }}
      />
      <pointLight
        name="FillLight"
        position={[-3, 3, -3]}
        intensity={0.5}
        userData={{ testId: 'fill-light' }}
      />
    </group>
  );
}

function Floor() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      name="Floor"
      receiveShadow
      userData={{ testId: 'floor' }}
    >
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#cccccc" />
    </mesh>
  );
}

function OrbitingSphere({ manual }: { manual?: boolean }) {
  const ref = useRef<THREE.Mesh>(null!);
  if (manual) useR3FRegister(ref);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ref.current.position.x = Math.cos(t) * 3;
    ref.current.position.z = Math.sin(t) * 3;
    ref.current.position.y = 1.5 + Math.sin(t * 3) * 0.3;
  });

  return (
    <mesh ref={ref} name="OrbitingSphere" userData={{ testId: 'orbiting-sphere' }}>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshStandardMaterial color="#4488ff" metalness={0.6} roughness={0.3} />
    </mesh>
  );
}

/**
 * Nested group — tests that filter with testId correctly registers
 * deep meshes AND their ancestor chain (Group → Mesh).
 */
function DecorGroup() {
  return (
    <group name="Decorations" userData={{ testId: 'decor-group' }}>
      <mesh
        position={[2, 0.95, 0]}
        name="Vase"
        userData={{ testId: 'vase' }}
      >
        <cylinderGeometry args={[0.1, 0.15, 0.3, 12]} />
        <meshStandardMaterial color="#cc4444" />
      </mesh>

      <group name="StackedBoxes" position={[-2, 0, -2]} userData={{ testId: 'stacked-boxes' }}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[0, 0.25 + i * 0.5, 0]}
            name={`Box${i + 1}`}
            userData={{ testId: `stacked-box-${i + 1}` }}
          >
            <boxGeometry args={[0.4 - i * 0.05, 0.4, 0.4 - i * 0.05]} />
            <meshStandardMaterial color={`hsl(${120 + i * 40}, 70%, 50%)`} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Deep nested group WITHOUT testId on intermediate groups.
 * Tests the ancestor chain fix: the Mesh has testId but its
 * parent Group ("Shelf") does NOT — filter should still work.
 */
function ShelfGroup() {
  return (
    <group name="Shelf" position={[-3, 0, 2]}>
      <mesh
        position={[0, 1, 0]}
        name="Book"
        userData={{ testId: 'book' }}
      >
        <boxGeometry args={[0.3, 0.4, 0.1]} />
        <meshStandardMaterial color="#2255aa" />
      </mesh>
      <mesh
        position={[0.4, 1, 0]}
        name="Lamp"
        userData={{ testId: 'lamp' }}
      >
        <cylinderGeometry args={[0.08, 0.12, 0.5, 8]} />
        <meshStandardMaterial color="#ffcc00" />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Scene wrapper — picks ThreeDom config based on mode
// ---------------------------------------------------------------------------

function SceneContent({ mode }: { mode: DemoMode }) {
  const isManual = mode === 'manual';

  return (
    <>
      <Lighting />
      <group name="Furniture" userData={{ testId: 'furniture-group' }}>
        <Chair manual={isManual} />
        <Table />
      </group>
      <Floor />
      <OrbitingSphere manual={isManual} />
      <DecorGroup />
      <ShelfGroup />
      <OrbitControls />
    </>
  );
}

// ---------------------------------------------------------------------------
// Filter: only objects with userData.testId
// ---------------------------------------------------------------------------

const testIdFilter = (obj: THREE.Object3D) => !!obj.userData?.testId;

// ---------------------------------------------------------------------------
// Status HUD
// ---------------------------------------------------------------------------

function StatusHUD({ mode, onModeChange }: { mode: DemoMode; onModeChange: (m: DemoMode) => void }) {
  const [stats, setStats] = useState<{
    objectCount: number;
    version: string;
    ready: boolean;
  }>({ objectCount: 0, version: '', ready: false });

  const refreshStats = useCallback(() => {
    const api = window.__R3F_DOM__;
    if (api) {
      setStats({
        objectCount: api.getCount(),
        version: api.version,
        ready: true,
      });
    } else {
      setStats({ objectCount: 0, version: '', ready: false });
    }
  }, []);

  useState(() => {
    const id = setInterval(refreshStats, 500);
    return () => clearInterval(id);
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        background: 'rgba(0,0,0,0.75)',
        color: '#fff',
        padding: '10px 16px',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 1.6,
        zIndex: 1000,
        userSelect: 'none',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#7df' }}>
        react-three-dom
      </div>
      <div>
        Status:{' '}
        <span style={{ color: stats.ready ? '#6f6' : '#f66' }}>
          {stats.ready ? 'Connected' : 'Waiting…'}
        </span>
      </div>
      {stats.ready && (
        <>
          <div>Objects: {stats.objectCount}</div>
          <div>Version: {stats.version}</div>
        </>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', marginBottom: 4 }}>
        Mode:
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['auto', 'auto-filter', 'manual'] as DemoMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            style={{
              padding: '3px 8px',
              fontSize: 11,
              fontFamily: 'monospace',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              background: mode === m ? '#4488ff' : '#444',
              color: '#fff',
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: '#888' }}>
        {mode === 'auto' && 'All objects registered automatically'}
        {mode === 'auto-filter' && 'Only objects with userData.testId (+ ancestor chain)'}
        {mode === 'manual' && 'Only Chair & OrbitingSphere via useR3FRegister'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const [mode, setMode] = useState<DemoMode>('auto');

  return (
    <>
      <StatusHUD mode={mode} onModeChange={setMode} />
      <Canvas
        key={mode}
        camera={{ position: [5, 5, 5], fov: 50 }}
        shadows
      >
        {mode === 'auto' && <ThreeDom debug />}
        {mode === 'auto-filter' && <ThreeDom debug filter={testIdFilter} />}
        {mode === 'manual' && <ThreeDom debug mode="manual" />}

        <SceneContent mode={mode} />
      </Canvas>
    </>
  );
}
