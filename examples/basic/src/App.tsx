import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

function Chair() {
  return (
    <mesh
      position={[0, 0.5, 0]}
      userData={{ testId: 'chair-primary' }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}

function Table() {
  return (
    <mesh
      position={[2, 0.25, 0]}
      userData={{ testId: 'table-main' }}
    >
      <boxGeometry args={[2, 0.5, 1]} />
      <meshStandardMaterial color="#8B4513" />
    </mesh>
  );
}

function Lighting() {
  return (
    <group name="Lighting">
      <ambientLight intensity={0.4} />
      <directionalLight
        name="SunLight"
        position={[5, 10, 5]}
        intensity={1}
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

export function App() {
  return (
    <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
      <Lighting />
      <group name="Furniture">
        <Chair />
        <Table />
      </group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        userData={{ testId: 'floor' }}
      >
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#cccccc" />
      </mesh>
      <OrbitControls />
    </Canvas>
  );
}
