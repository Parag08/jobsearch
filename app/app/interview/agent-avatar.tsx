"use client";

import { useEffect, useRef, useState } from "react";
import { smoothLevel, type AgentState } from "@/lib/interview/agent";
import ui from "../ui.module.css";

/**
 * The AI interviewer, drawn with Three.js: an abstract orb whose surface moves with its
 * voice, inside a slow ring of particles. Deliberately not a face - it is an agent, and
 * an uncanny human would distract from the answer.
 *
 * States (lib/interview/agent.ts): idle drifts, listening leans in and ripples with YOUR
 * voice, thinking swirls, speaking pulses with its own audio, done settles. The one
 * in-app animation the design allows (DESIGN.md section 8); prefers-reduced-motion keeps
 * it nearly still. Three.js loads only when the room opens, and the loop stops when the
 * canvas is off screen.
 *
 * `getState` and `getLevel` are read every frame, so React never re-renders to animate.
 */

interface Look {
  amp: number; // surface displacement
  speed: number; // noise flow
  spin: number; // particle ring rad/s
  scale: number;
  glow: number; // 0-1 mix towards the light colour
}

const LOOKS: Record<AgentState, Look> = {
  idle: { amp: 0.045, speed: 0.22, spin: 0.08, scale: 1, glow: 0.15 },
  listening: { amp: 0.035, speed: 0.35, spin: 0.12, scale: 1.04, glow: 0.35 },
  thinking: { amp: 0.09, speed: 1.1, spin: 0.55, scale: 0.97, glow: 0.55 },
  speaking: { amp: 0.06, speed: 0.6, spin: 0.18, scale: 1, glow: 0.3 },
  done: { amp: 0.03, speed: 0.12, spin: 0.04, scale: 0.94, glow: 0.05 },
};
/** How much the live level adds, per state. */
const LEVEL_AMP: Partial<Record<AgentState, number>> = { speaking: 0.42, listening: 0.22 };

// Ashima Arts 3D simplex noise (MIT), the usual GLSL port.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERTEX = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform float uFlow;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
${NOISE}
void main(){
  float n = snoise(normal * 1.6 + vec3(uFlow));
  float n2 = snoise(normal * 2.4 - vec3(uFlow * 0.7));
  float d = (n * 0.82 + n2 * 0.18) * uAmp;
  vNoise = n;
  vec3 pos = position + normal * d;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor; uniform vec3 uLight; uniform float uGlow; uniform float uFade;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
void main(){
  float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
  vec3 base = mix(uColor * 0.55, uColor, 0.5 + 0.5 * vNoise);
  vec3 col = mix(base, uLight, clamp(fres * (0.6 + uGlow), 0.0, 1.0));
  col += uLight * uGlow * 0.18;
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function AgentAvatar({
  getState,
  getLevel,
  label,
  lift = 0.35,
}: {
  getState: () => AgentState;
  getLevel: () => number;
  label: string;
  /** Raise the orb (scene units) so the stage's foot - captions, controls - stays clear. */
  lift?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three")
      .then((THREE) => {
        if (disposed) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch {
          setFailed(true);
          return;
        }
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const motion = reduce ? 0.25 : 1;

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
        camera.position.set(0, -lift, 6);

        const accent = new THREE.Color(cssColor("--accent", "#4f6f52"));
        const light = new THREE.Color(cssColor("--room-glow", "#f6efe0"));

        const uniforms = {
          uTime: { value: 0 },
          uAmp: { value: LOOKS.idle.amp },
          uFlow: { value: 0 },
          uColor: { value: accent },
          uLight: { value: light },
          uGlow: { value: LOOKS.idle.glow },
          uFade: { value: 1 },
        };
        const orbGeo = new THREE.IcosahedronGeometry(0.95, 64);
        const orbMat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        scene.add(orb);

        // A soft ring of particles, slightly tilted, that orbits the orb.
        const COUNT = 700;
        const positions = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 0.5 + (Math.random() < 0.15 ? Math.random() * 0.6 : 0);
          positions[i * 3] = Math.cos(a) * r;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 0.22;
          positions[i * 3 + 2] = Math.sin(a) * r;
        }
        const ringGeo = new THREE.BufferGeometry();
        ringGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const ringMat = new THREE.PointsMaterial({
          color: light,
          size: 0.028,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const ring = new THREE.Points(ringGeo, ringMat);
        ring.rotation.x = 0.42;
        ring.rotation.z = -0.12;
        scene.add(ring);

        const resize = () => {
          const w = el.clientWidth || 1;
          const h = el.clientHeight || 1;
          renderer.setSize(w, h, false);
          renderer.domElement.style.width = "100%";
          renderer.domElement.style.height = "100%";
          camera.aspect = w / h;
          // Keep the orb in proportion on narrow screens and short stages.
          camera.position.z = (w / h < 1 ? 6 / (w / h) : 6) * Math.max(1, 400 / h);
          camera.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        resize();

        // Current values ease towards the state's look - no snapping between states.
        const now: Look = { ...LOOKS.idle };
        let level = 0;
        let flow = 0;
        let last = performance.now();
        let raf = 0;
        let visible = true;

        const frame = (t: number) => {
          raf = requestAnimationFrame(frame);
          if (!visible) return;
          const dt = Math.min(64, t - last);
          last = t;
          const state = getState();
          const target = LOOKS[state];
          const k = 1 - Math.exp(-dt / 260);
          (Object.keys(now) as (keyof Look)[]).forEach((key) => {
            now[key] += (target[key] - now[key]) * k;
          });
          level = smoothLevel(level, LEVEL_AMP[state] ? getLevel() : 0, dt);

          flow += (dt / 1000) * now.speed * motion;
          uniforms.uFlow.value = flow;
          uniforms.uAmp.value = (now.amp + level * (LEVEL_AMP[state] ?? 0)) * (reduce ? 0.5 : 1);
          uniforms.uGlow.value = now.glow + level * 0.25;
          uniforms.uFade.value += ((state === "done" ? 0.6 : 1) - uniforms.uFade.value) * k;
          const s = now.scale + level * 0.06 * motion;
          orb.scale.setScalar(s);
          orb.rotation.y += (dt / 1000) * 0.12 * motion;
          ring.rotation.y += (dt / 1000) * now.spin * motion;
          ringMat.opacity = 0.35 + now.glow * 0.45;
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(frame);

        const io = new IntersectionObserver(([e]) => {
          visible = e.isIntersecting;
          last = performance.now();
        });
        io.observe(el);

        cleanup = () => {
          cancelAnimationFrame(raf);
          io.disconnect();
          ro.disconnect();
          orbGeo.dispose();
          orbMat.dispose();
          ringGeo.dispose();
          ringMat.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => setFailed(true));

    return () => {
      disposed = true;
      cleanup();
    };
    // getState/getLevel are read through refs by the caller; mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={host} className={ui.agentCanvas} role="img" aria-label={label}>
      {failed && <div className={ui.agentFallback} aria-hidden="true" />}
    </div>
  );
}
