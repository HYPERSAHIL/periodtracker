import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Scroll-through-worlds onboarding story.
 *
 * Craft rules applied (open-design animation-discipline + gsap-performance + anti-slop):
 * - One continuous camera dolly through 4 "worlds" driven by page scroll (scrub).
 * - transform/position/rotation only; no layout properties animated.
 * - prefers-reduced-motion: camera stays put, worlds still crossfade via captions.
 * - Mobile-first: DPR capped at 1.75, low geometry counts, no postprocessing.
 * - Brand tokens from styles.css; muted rose for period, sage/steel for phases.
 */

const WORLDS = [
  {
    id: 'noise',
    kicker: 'Before',
    title: 'Tracking felt like noise',
    copy: 'Scattered apps, ads, paywalls. Your cycle buried under someone else\u2019s business model.',
    accent: '#8f6f74',
  },
  {
    id: 'bleed',
    kicker: 'Days 1 to 5',
    title: 'Menstrual',
    copy: 'Log flow in two taps. Rest is data too. Predictions pause until you are ready.',
    accent: '#c94c5a',
  },
  {
    id: 'follicular',
    kicker: 'Days 6 to 13',
    title: 'Follicular',
    copy: 'Energy returns. The app learns your rhythm from your logs, not a textbook average.',
    accent: '#5b7a8a',
  },
  {
    id: 'luteal',
    kicker: 'Day 14 onward',
    title: 'Luteal and beyond',
    copy: 'PMS patterns surface early. Perimenopause, TTC, pregnancy: the app adapts, free forever.',
    accent: '#2d5a3a',
  },
];

/** Soft particle field that reorganizes from chaos cloud into an orderly ring. */
function ParticleField({ progress }: { progress: React.MutableRefObject<number> }) {
  const COUNT = window.innerWidth < 480 ? 220 : 420;
  const points = useRef<THREE.Points>(null);

  const { positions, startPositions } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const startPositions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const sx = (Math.random() - 0.5) * 14;
      const sy = (Math.random() - 0.5) * 10;
      const sz = (Math.random() - 0.5) * 6 - 2;
      positions[i * 3] = sx;
      positions[i * 3 + 1] = sy;
      positions[i * 3 + 2] = sz;
      startPositions[i * 3] = sx;
      startPositions[i * 3 + 1] = sy;
      startPositions[i * 3 + 2] = sz;
    }
    return { positions, startPositions };
  }, [COUNT]);

  useFrame(() => {
    if (!points.current) return;
    const p = progress.current;
    // chaos -> ring across the first two worlds (0.12..0.4 of journey)
    const organize = Math.min(Math.max((p - 0.12) / 0.28, 0), 1);
    const posAttr = points.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < COUNT; i++) {
      const t = i / COUNT;
      const angle = t * Math.PI * 2 + p * Math.PI * 2;
      const ringX = Math.cos(angle) * 2.4;
      const ringY = Math.sin(angle) * 2.4;
      const ix = i * 3;
      const tx = startPositions[ix] * (1 - organize) + ringX * organize;
      const ty = startPositions[ix + 1] * (1 - organize) + ringY * organize;
      const tz = startPositions[ix + 2] * (1 - organize) + -1.5 * organize;
      arr[ix] += (tx - arr[ix]) * 0.08;
      arr[ix + 1] += (ty - arr[ix + 1]) * 0.08;
      arr[ix + 2] += (tz - arr[ix + 2]) * 0.08;
    }
    posAttr.needsUpdate = true;
    points.current.rotation.z = p * Math.PI * 1.5;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.055} color="#e11d63" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** Central low-poly orb that shifts hue per world and breathes gently. */
function JourneyOrb({ progress }: { progress: React.MutableRefObject<number> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const colors = useMemo(
    () => ['#8f6f74', '#c94c5a', '#5b7a8a', '#2d5a3a'].map((c) => new THREE.Color(c)),
    []
  );

  useFrame((state) => {
    if (!mesh.current || !mat.current) return;
    const p = Math.min(progress.current, 0.999);
    const seg = Math.min(Math.floor(p * 4), 3);
    const next = colors[(seg + 1) % 4];
    const local = p * 4 - seg;
    mat.current.color.copy(colors[seg]).lerp(next, local * 0.35);
    const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.4) * 0.04;
    mesh.current.scale.setScalar(breathe);
    mesh.current.rotation.y = state.clock.elapsedTime * 0.18;
    mesh.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.15;
  });

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.15, 3]} />
      <meshStandardMaterial ref={mat} color="#c94c5a" roughness={0.35} metalness={0.1} flatShading />
    </mesh>
  );
}

/** Two thin orbit rings around the orb. */
function OrbitRings({ progress }: { progress: React.MutableRefObject<number> }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    g.current.rotation.x = Math.PI / 2.6 + state.clock.elapsedTime * 0.08;
    g.current.rotation.y = state.clock.elapsedTime * 0.12 + progress.current * 2;
  });
  return (
    <group ref={g}>
      <mesh>
        <torusGeometry args={[2.1, 0.014, 8, 90]} />
        <meshBasicMaterial color="#e8a0b0" transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[0.6, 0.4, 0]}>
        <torusGeometry args={[2.7, 0.01, 8, 90]} />
        <meshBasicMaterial color="#9db8c4" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

/** Camera rig: dollies forward through the worlds on scroll. */
function CameraRig({ progress }: { progress: React.MutableRefObject<number> }) {
  const { camera } = useThree();
  useFrame(() => {
    const p = progress.current;
    camera.position.z = 6 - p * 10;
    camera.position.y = Math.sin(p * Math.PI) * 0.4;
    camera.lookAt(0, 0, camera.position.z - 5);
  });
  return null;
}

/** Background + fog tint shift per world segment. */
function Atmosphere({ progress }: { progress: React.MutableRefObject<number> }) {
  const { scene } = useThree();
  const colors = useMemo(
    () => ['#fdf5f7', '#fbe9ee', '#eef3f6', '#eff5f0'].map((c) => new THREE.Color(c)),
    []
  );
  const bg = useMemo(() => new THREE.Color('#fdf5f7'), []);
  useEffect(() => {
    scene.background = bg;
    scene.fog = new THREE.Fog(bg.clone(), 7, 16);
  }, [scene, bg]);
  useFrame(() => {
    const p = Math.min(progress.current, 0.999);
    const seg = Math.min(Math.floor(p * 4), 3);
    const local = Math.min(p * 4 - seg, 1);
    bg.copy(colors[seg]).lerp(colors[Math.min(seg + 1, 3)], local);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(bg);
  });
  return null;
}

export default function WorldsOnboarding({ onFinish }: { onFinish: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [activeWorld, setActiveWorld] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!wrapRef.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        const total = rect.height - window.innerHeight;
        const scrolled = Math.min(Math.max(-rect.top / total, 0), 1);
        progress.current = scrolled;
        setActiveWorld(Math.min(Math.floor(scrolled * 4), 3));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const world = WORLDS[activeWorld];
  const travel = reduced ? 0 : progress.current;

  return (
    <div ref={wrapRef} style={{ height: reduced ? 'auto' : '480vh' }}>
      {/* fixed canvas behind everything */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 0, 6], fov: 55 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        >
          <Atmosphere progress={{ current: travel }} />
          <ambientLight intensity={0.85} />
          <directionalLight position={[4, 6, 6]} intensity={1.1} />
          <CameraRig progress={{ current: travel }} />
          <ParticleField progress={{ current: travel }} />
          <JourneyOrb progress={{ current: travel }} />
          <OrbitRings progress={{ current: travel }} />
        </Canvas>
      </div>

      {/* fixed UI overlay */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'calc(20px + env(safe-area-inset-top)) 22px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Period Tracker
          </div>
        </div>

        {/* world caption card */}
        <div style={{ marginTop: 'auto', padding: '0 18px calc(26px + env(safe-area-inset-bottom))', pointerEvents: 'auto' }}>
          <div
            key={world.id}
            style={{
              background: 'rgba(255,255,255,0.84)',
              backdropFilter: 'blur(18px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
              border: '1px solid rgba(255,255,255,0.6)',
              borderRadius: 24,
              padding: '20px 18px',
              boxShadow: '0 16px 40px rgba(185,0,77,0.10)',
              animation: 'worldIn 380ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: world.accent }}>
              {world.kicker}
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '6px 0 8px', lineHeight: 1.05 }}>
              {world.title}
            </h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-2)', margin: 0 }}>{world.copy}</p>

            {/* progress bars */}
            <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
              {WORLDS.map((w, i) => (
                <div
                  key={w.id}
                  style={{
                    height: 4,
                    flex: 1,
                    borderRadius: 99,
                    background: i <= activeWorld ? world.accent : 'var(--border)',
                    transition: 'background 300ms cubic-bezier(0.23, 1, 0.32, 1)',
                  }}
                />
              ))}
            </div>

            {activeWorld === WORLDS.length - 1 && (
              <button onClick={onFinish} className="btn primary" style={{ marginTop: 16 }}>
                Start tracking
              </button>
            )}
          </div>
          {!reduced && activeWorld === 0 && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 10, fontWeight: 600 }}>
              Keep scrolling to travel
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes worldIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes worldIn { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
