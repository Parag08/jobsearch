"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EDGES,
  FLOWS,
  LAYERS,
  NODES,
  edgeKey,
  edgesFor,
  flowNodes,
  layoutFlow,
  layoutGraph,
  nodesFor,
  type ArchNode,
  type Era,
  type LayerId,
  type Layout,
  type Status,
} from "@/lib/architecture/graph";
import styles from "./architecture.module.css";

/**
 * The architecture, drawn with Three.js - one small diagram per flow.
 *
 * A flow shows only the parts it touches (a dozen at most), stacked by layer, and walks
 * its steps one at a time with a sentence for each. "Whole system" is the last choice,
 * for when the pieces already make sense: every part, today or planned.
 *
 * Everything drawn comes from lib/architecture/graph.ts - this file invents no node. All
 * 49 blocks exist in the scene once; choosing a view moves the ones it needs into place
 * and fades the rest. React owns the choices and hands them to the render loop through a
 * ref, so the scene animates without React re-rendering. The panel and the list under the
 * stage carry the same content for keyboards, screen readers and machines without WebGL.
 * prefers-reduced-motion stops the sway, the dots and the auto-play.
 *
 * Public page, so it sits under the marketing motion allowance (DESIGN.md section 5), not
 * the 120ms in-app rule. Three.js loads only here, after mount.
 */

interface View {
  /** A flow id, or null for the whole system. */
  flow: string | null;
  era: Era;
  step: number;
  selected: string | null;
  hover: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  live: "Live",
  partial: "Built, not wired",
  planned: "Planned",
};
const STEP_MS = 2600;

const BY_ID = new Map(NODES.map((n) => [n.id, n]));
const FLOW_BY_ID = new Map(FLOWS.map((f) => [f.id, f]));
const LAYER_LABEL = new Map(LAYERS.map((l) => [l.id, l.label]));

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** What a view puts on the stage. */
function contentsOf(view: Pick<View, "flow" | "era">): { nodes: ArchNode[]; edges: { from: string; to: string }[] } {
  const flow = view.flow ? FLOW_BY_ID.get(view.flow) : undefined;
  if (flow) return { nodes: flowNodes(flow), edges: flow.steps };
  return { nodes: nodesFor(view.era), edges: edgesFor(view.era) };
}

/** Who calls a part and whom it calls, among the edges on the stage. */
function around(id: string, edges: { from: string; to: string }[]): { in: string[]; out: string[] } {
  return {
    in: [...new Set(edges.filter((e) => e.to === id).map((e) => e.from))],
    out: [...new Set(edges.filter((e) => e.from === id).map((e) => e.to))],
  };
}

export function ArchitectureScene() {
  const [flowId, setFlowId] = useState<string | null>(FLOWS[0].id);
  const [era, setEra] = useState<Era>("today");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ flow: flowId, era, step, selected, hover: null });
  const dirtyRef = useRef(true);
  const reframeRef = useRef(true);
  const commandRef = useRef<"reset" | "in" | "out" | null>(null);

  const flow = flowId ? FLOW_BY_ID.get(flowId) : undefined;
  const contents = useMemo(() => contentsOf({ flow: flowId, era }), [flowId, era]);

  // The render loop reads the latest choice from here.
  useEffect(() => {
    viewRef.current = { ...viewRef.current, flow: flowId, era, step, selected };
    dirtyRef.current = true;
  }, [flowId, era, step, selected]);
  // A new diagram is a new framing; a new step or selection is not.
  useEffect(() => {
    reframeRef.current = true;
  }, [flowId, era]);

  // Steps play on their own unless the visitor asked for less motion.
  useEffect(() => {
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useEffect(() => {
    if (!flow || !playing || selected) return;
    const timer = window.setTimeout(() => setStep((s) => (s + 1) % flow.steps.length), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [flow, playing, selected, step]);

  const chooseFlow = (id: string | null) => {
    setFlowId(id);
    setStep(0);
    setSelected(null);
  };
  const chooseEra = (next: Era) => {
    setEra(next);
    if (next === "today" && selected && BY_ID.get(selected)?.era === "future") setSelected(null);
  };
  const chooseStep = (i: number) => {
    setPlaying(false);
    setSelected(null);
    setStep(i);
  };
  const chooseNode = (id: string) => setSelected((cur) => (cur === id ? null : id));

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let disposed = false;
    let cleanup = () => {};

    void Promise.all([
      import("three"),
      import("three/examples/jsm/controls/OrbitControls.js"),
      import("three/examples/jsm/renderers/CSS2DRenderer.js"),
    ])
      .then(([THREE, { OrbitControls }, { CSS2DRenderer, CSS2DObject }]) => {
        if (disposed) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const systemLayout = layoutGraph();
        const flowLayouts = new Map<string, Layout>(FLOWS.map((f) => [f.id, layoutFlow(f)]));
        const layoutOf = (view: View): Layout => (view.flow ? flowLayouts.get(view.flow)! : systemLayout);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.className = styles.canvas;
        stage.appendChild(renderer.domElement);

        const labels = new CSS2DRenderer();
        labels.domElement.className = styles.labels;
        stage.appendChild(labels.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enableZoom = false; // the page scrolls; zoom is on the buttons
        controls.maxPolarAngle = Math.PI * 0.62;
        // Until someone takes hold of it, the view sways a little either side of the front:
        // enough to read as 3D, never so far that the labels face away.
        const home = new THREE.Vector3(0.42, 0.4, 0.81).normalize();
        const homeAzimuth = Math.atan2(home.x, home.z);
        let swaying = !reduce;
        let settling = true; // the camera is still ours to place
        const release = () => {
          swaying = false;
          settling = false;
          controls.minAzimuthAngle = -Infinity;
          controls.maxAzimuthAngle = Infinity;
        };
        controls.addEventListener("start", release);

        scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(8, 20, 12);
        scene.add(sun);

        const disposables: { dispose: () => void }[] = [];
        const track = <T extends { dispose: () => void }>(x: T): T => {
          disposables.push(x);
          return x;
        };

        // ---- slabs, one per layer ------------------------------------------------------
        const unit = track(new THREE.BoxGeometry(1, 0.05, 1));
        const unitEdges = track(new THREE.EdgesGeometry(unit));
        const slabs = LAYERS.map((layer) => {
          const mat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
          const lineMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0 }));
          const mesh = new THREE.Mesh(unit, mat);
          mesh.renderOrder = -1;
          const outline = new THREE.LineSegments(unitEdges, lineMat);
          const el = document.createElement("div");
          el.className = styles.layerLabel;
          el.textContent = layer.label;
          el.style.opacity = "0";
          const tag = new CSS2DObject(el);
          tag.center.set(1, 0.5);
          const group = new THREE.Group();
          group.add(mesh, outline, tag);
          group.visible = false;
          scene.add(group);
          const goal = null as { y: number; width: number; depth: number } | null;
          return { id: layer.id as LayerId, group, mesh, outline, tag, el, mat, lineMat, show: 0, shown: 0, y: 0, w: 10, d: 6, goal };
        });
        // The strip each layer grows into for what is planned (whole system, future view).
        const extMat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        const extLineMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0 }));
        const extParts: InstanceType<typeof THREE.Object3D>[] = [];
        for (const layer of LAYERS) {
          const p = systemLayout.layers.get(layer.id)!;
          const ext = new THREE.Mesh(unit, extMat);
          ext.renderOrder = -1;
          const extOutline = new THREE.LineSegments(unitEdges, extLineMat);
          for (const part of [ext, extOutline]) {
            part.position.set(p.extension.x, p.y - 0.34, 0);
            part.scale.set(p.extension.width, 1, p.depth);
            part.visible = false;
            scene.add(part);
            extParts.push(part);
          }
        }
        let extMix = 0;

        // ---- a block per part ----------------------------------------------------------
        const boxGeo = track(new THREE.BoxGeometry(2.8, 0.56, 1.7));
        const boxEdges = track(new THREE.EdgesGeometry(boxGeo));
        const nodeItems = NODES.map((node) => {
          const at = systemLayout.nodes.get(node.id)!;
          const fill = track(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, roughness: 0.85, metalness: 0 }));
          const line = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0 }));
          const mesh = new THREE.Mesh(boxGeo, fill);
          mesh.userData.id = node.id;
          const group = new THREE.Group();
          group.add(mesh, new THREE.LineSegments(boxEdges, line));
          group.visible = false;
          scene.add(group);

          const el = document.createElement("div");
          el.className = styles.nodeLabel;
          el.dataset.status = node.status;
          el.textContent = node.label;
          el.style.opacity = "0";
          const tag = new CSS2DObject(el);
          tag.center.set(0.5, 1);
          tag.position.set(0, 0.42, 0);
          group.add(tag);

          return {
            node,
            group,
            mesh,
            fill,
            line,
            el,
            pos: new THREE.Vector3(at.x, at.y, at.z),
            goal: new THREE.Vector3(at.x, at.y, at.z),
            show: 0,
            shown: 0,
            emph: 1,
            emphNow: 1,
            lastOpacity: 0,
          };
        });
        const nodeItem = new Map(nodeItems.map((n) => [n.node.id, n]));
        const pickable = nodeItems.map((n) => n.mesh);

        // ---- a line per call, with dots travelling along it ----------------------------
        const DOTS = 2;
        const SEGMENTS = 28;
        const edgeItems = EDGES.map((edge, i) => {
          const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
          const mat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
          const geo = track(new THREE.BufferGeometry());
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
          const lineObj = new THREE.Line(geo, mat);
          lineObj.frustumCulled = false;
          lineObj.visible = false;
          scene.add(lineObj);
          return {
            edge,
            key: edgeKey(edge),
            from: nodeItem.get(edge.from)!,
            to: nodeItem.get(edge.to)!,
            curve,
            geo,
            mat,
            lineObj,
            fresh: false,
            phase: (i * 0.37) % 1,
            show: 0,
            emph: 0.5,
          };
        });
        const edgeItem = new Map(edgeItems.map((e) => [e.key, e]));
        const tmp = new THREE.Vector3();
        // Between layers a call leaves and arrives vertically; within a layer it arcs over the blocks.
        const bend = (e: (typeof edgeItems)[number]) => {
          const { v0, v1, v2, v3 } = e.curve;
          v0.copy(e.from.pos);
          v3.copy(e.to.pos);
          const dy = v3.y - v0.y;
          const flat = Math.abs(dy) < 0.01;
          const lift = flat ? 1.25 : dy * 0.5;
          v1.copy(v0).setY(v0.y + lift);
          v2.copy(v3).setY(v3.y + (flat ? lift : -lift));
          const attr = e.geo.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
          for (let s = 0; s <= SEGMENTS; s++) {
            e.curve.getPoint(s / SEGMENTS, tmp);
            attr.setXYZ(s, tmp.x, tmp.y, tmp.z);
          }
          attr.needsUpdate = true;
        };

        const dotPos = new Float32Array(edgeItems.length * DOTS * 3);
        const dotCol = new Float32Array(edgeItems.length * DOTS * 3);
        const dotGeo = track(new THREE.BufferGeometry());
        dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
        dotGeo.setAttribute("color", new THREE.BufferAttribute(dotCol, 3));
        const disc = document.createElement("canvas");
        disc.width = disc.height = 64;
        const ctx = disc.getContext("2d")!;
        ctx.beginPath();
        ctx.arc(32, 32, 28, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        const discTex = track(new THREE.CanvasTexture(disc));
        const dotMat = track(
          new THREE.PointsMaterial({ size: 0.36, map: discTex, alphaTest: 0.5, vertexColors: true, sizeAttenuation: true }),
        );
        const dots = new THREE.Points(dotGeo, dotMat);
        dots.frustumCulled = false;
        scene.add(dots);

        // The packet that travels the step a flow is on.
        const packetMat = track(new THREE.MeshBasicMaterial());
        const packet = new THREE.Mesh(track(new THREE.SphereGeometry(0.26, 20, 20)), packetMat);
        packet.visible = false;
        scene.add(packet);

        // ---- colour, from the design tokens ---------------------------------------------
        const colour = { accent: new THREE.Color(), warm: new THREE.Color(), neutral: new THREE.Color() };
        const paint = () => {
          colour.accent.set(cssVar("--accent"));
          colour.warm.set(cssVar("--warm"));
          colour.neutral.set(cssVar("--ink-soft"));
          for (const s of slabs) {
            s.mat.color.set(cssVar("--wash"));
            s.lineMat.color.set(cssVar("--line-strong"));
          }
          extMat.color.set(cssVar("--warm-wash"));
          extLineMat.color.set(cssVar("--warm"));
          packetMat.color.set(cssVar("--warm"));
          for (const n of nodeItems) {
            if (n.node.status === "live") {
              n.fill.color.set(cssVar("--accent"));
              n.line.color.set(cssVar("--accent-text"));
            } else if (n.node.status === "partial") {
              n.fill.color.set(cssVar("--stale"));
              n.line.color.set(cssVar("--stale-text"));
            } else {
              n.fill.color.set(cssVar("--warm"));
              n.line.color.set(cssVar("--warm"));
            }
          }
          edgeItems.forEach((e, i) => {
            const planned = e.edge.era === "future";
            e.mat.color.copy(planned ? colour.warm : colour.neutral);
            for (let d = 0; d < DOTS; d++) (planned ? colour.warm : colour.accent).toArray(dotCol, (i * DOTS + d) * 3);
          });
          dotGeo.attributes.color.needsUpdate = true;
        };
        paint();
        const themeWatch = new MutationObserver(paint);
        themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

        // ---- camera ----------------------------------------------------------------------
        const PANEL = 364; // the detail panel overlays the right of a wide stage
        const centre = new THREE.Vector3();
        let radius = 12;
        let fit = 40;
        const measure = () => {
          const w = stage.clientWidth;
          const h = stage.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h);
          labels.setSize(w, h);
          camera.aspect = w / h;
          // Centre the drawing in the space the panel leaves free.
          if (w > 860) camera.setViewOffset(w, h, PANEL / 2, 0, w, h);
          else camera.clearViewOffset();
          camera.updateProjectionMatrix();
          const half = THREE.MathUtils.degToRad(camera.fov / 2);
          const free = w > 860 ? (w - PANEL) / h : camera.aspect;
          fit = radius / Math.sin(Math.min(half, Math.atan(Math.tan(half) * free)));
          controls.minDistance = fit * 0.4;
          controls.maxDistance = fit * 1.6;
        };
        camera.position.copy(home).multiplyScalar(40);
        measure();
        const resize = new ResizeObserver(measure);
        resize.observe(stage);

        // ---- pointer: hover and select ---------------------------------------------------
        const ray = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let down: { x: number; y: number } | null = null;
        const hit = (ev: PointerEvent): string | null => {
          const r = renderer.domElement.getBoundingClientRect();
          pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(pointer, camera);
          const found = ray.intersectObjects(pickable, false).find((x) => nodeItem.get(x.object.userData.id as string)!.show > 0.5);
          return found ? (found.object.userData.id as string) : null;
        };
        const setHover = (id: string | null) => {
          if (id === viewRef.current.hover) return;
          viewRef.current = { ...viewRef.current, hover: id };
          dirtyRef.current = true;
        };
        const onMove = (ev: PointerEvent) => {
          if (ev.pointerType === "touch") return;
          const id = hit(ev);
          renderer.domElement.style.cursor = id ? "pointer" : "grab";
          setHover(id);
        };
        const onDown = (ev: PointerEvent) => (down = { x: ev.clientX, y: ev.clientY });
        const onUp = (ev: PointerEvent) => {
          const moved = down ? Math.hypot(ev.clientX - down.x, ev.clientY - down.y) : 99;
          down = null;
          if (moved > 5) return; // that was a drag, not a click
          const id = hit(ev);
          setSelected((cur) => (id === cur ? null : id));
        };
        const onLeave = () => setHover(null);
        const canvas = renderer.domElement;
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointerleave", onLeave);

        // ---- targets: what the current choice shows, moves and dims ----------------------
        let stepCurve: InstanceType<typeof THREE.CubicBezierCurve3> | null = null;
        let stepClock = 0;
        let lastStepKey = "";
        const retarget = (reframe: boolean) => {
          const view = viewRef.current;
          const layout = layoutOf(view);
          const { nodes, edges } = contentsOf(view);
          const shownNodes = new Set(nodes.map((n) => n.id));
          const shownEdges = new Set(edges.map(edgeKey));
          const flow = view.flow ? FLOW_BY_ID.get(view.flow) : undefined;
          const current = flow ? flow.steps[view.step % flow.steps.length] : undefined;

          // What is singled out: a selected (or, in the whole system, hovered) part and its neighbours.
          const pick = view.selected ?? (flow ? null : view.hover);
          let focusNodes: Set<string> | null = null;
          let focusEdges: Set<string> | null = null;
          if (pick && shownNodes.has(pick)) {
            const near = around(pick, edges);
            focusNodes = new Set([pick, ...near.in, ...near.out]);
            focusEdges = new Set([...near.in.map((from) => edgeKey({ from, to: pick })), ...near.out.map((to) => edgeKey({ from: pick, to }))]);
          }

          for (const n of nodeItems) {
            const id = n.node.id;
            const on = shownNodes.has(id);
            if (on) {
              const at = layout.nodes.get(id)!;
              n.goal.set(at.x, at.y, at.z);
              if (n.shown < 0.02) n.pos.copy(n.goal); // arriving parts appear in place, they do not fly in
            }
            n.show = on ? 1 : 0;
            n.emph = !focusNodes || focusNodes.has(id) ? 1 : 0.16;
            const active = id === view.selected || id === view.hover || (!view.selected && (id === current?.from || id === current?.to));
            n.el.toggleAttribute("data-active", active);
          }
          for (const e of edgeItems) {
            e.show = shownEdges.has(e.key) ? 1 : 0;
            if (focusEdges) e.emph = focusEdges.has(e.key) ? 1 : 0.05;
            else if (current) e.emph = e.key === edgeKey(current) ? 1 : 0.3;
            else e.emph = 0.5;
          }
          for (const s of slabs) {
            const p = layout.layers.get(s.id);
            s.show = p ? 1 : 0;
            if (p) {
              if (!s.goal || s.shown < 0.02) {
                s.y = p.y;
                s.w = p.width;
                s.d = p.depth;
              }
              s.goal = { y: p.y, width: p.width, depth: p.depth };
            }
          }
          const stepKey = current && !view.selected ? `${view.flow}:${view.step}` : "";
          stepCurve = stepKey ? edgeItem.get(edgeKey(current!))!.curve : null;
          if (stepKey !== lastStepKey) stepClock = 0; // a hover must not restart the packet
          lastStepKey = stepKey;

          if (reframe) {
            const box = new THREE.Box3();
            for (const n of nodes) box.expandByPoint(nodeItem.get(n.id)!.goal);
            // The layer names hang off the left edge of each slab; keep them in frame.
            // (A narrow stage hides them - the list underneath names the layers.)
            if (stage.clientWidth > 860) {
              for (const p of layout.layers.values()) box.expandByPoint(tmp.set(-p.width / 2 - 4.5, p.y, p.depth / 2));
            }
            if (!flow && view.era === "future") {
              const any = systemLayout.layers.get("clients")!;
              box.expandByPoint(tmp.set(any.extension.x + any.extension.width / 2, 0, 0));
            }
            box.getCenter(centre);
            centre.z = 0;
            radius = box.getSize(tmp).length() / 2 + 3.4;
            measure();
            settling = true;
          }
        };

        // ---- loop ------------------------------------------------------------------------
        const clock = new THREE.Clock();
        let raf = 0;
        let running = true;
        let time = 0;
        let first = true;
        const tick = () => {
          raf = running ? requestAnimationFrame(tick) : 0;
          const dt = Math.min(clock.getDelta(), 0.05);
          time += dt;
          if (dirtyRef.current) {
            dirtyRef.current = false;
            retarget(reframeRef.current);
            reframeRef.current = false;
          }
          // The first frame is drawn complete, so the page never shows an empty stage.
          const k = reduce || first ? 1 : 1 - Math.exp(-dt * 7);
          const slow = reduce || first ? 1 : 1 - Math.exp(-dt * 4);
          first = false;

          const command = commandRef.current;
          if (command) {
            commandRef.current = null;
            if (command === "reset") {
              camera.position.copy(controls.target).addScaledVector(home, camera.position.distanceTo(controls.target));
              settling = true;
              swaying = !reduce;
            } else {
              settling = false;
              const dir = camera.position.clone().sub(controls.target);
              const dist = THREE.MathUtils.clamp(dir.length() * (command === "in" ? 0.8 : 1.25), controls.minDistance, controls.maxDistance);
              camera.position.copy(controls.target).addScaledVector(dir.normalize(), dist);
            }
          }
          // While the camera is ours, ease it to frame whatever the view shows.
          if (settling) {
            const offset = camera.position.clone().sub(controls.target);
            const dist = offset.length();
            controls.target.lerp(centre, slow);
            camera.position.copy(controls.target).addScaledVector(offset.normalize(), dist + (fit - dist) * slow);
          }

          let moving = false;
          for (const n of nodeItems) {
            n.shown += (n.show - n.shown) * k;
            n.emphNow += (n.emph - n.emphNow) * k;
            if (n.pos.distanceToSquared(n.goal) > 1e-6) {
              n.pos.lerp(n.goal, k);
              moving = true;
            }
            n.group.visible = n.shown > 0.02;
            n.group.position.copy(n.pos);
            n.group.position.y += (1 - n.shown) * 1.2; // parts settle in from just above
            const opacity = n.shown * n.emphNow;
            n.fill.opacity = opacity * (n.node.status === "planned" ? 0.5 : 1); // planned reads lighter than built
            n.line.opacity = opacity;
            const labelOpacity = Math.round(n.shown * (n.emphNow < 0.5 ? 0.22 : 1) * 20) / 20;
            if (labelOpacity !== n.lastOpacity) {
              n.lastOpacity = labelOpacity;
              n.el.style.opacity = String(labelOpacity);
            }
          }

          for (const s of slabs) {
            s.shown += (s.show - s.shown) * k;
            if (s.goal) {
              s.y += (s.goal.y - s.y) * k;
              s.w += (s.goal.width - s.w) * k;
              s.d += (s.goal.depth - s.d) * k;
            }
            s.group.visible = s.shown > 0.02;
            s.group.position.y = s.y - 0.34;
            s.mesh.scale.set(s.w, 1, s.d);
            s.outline.scale.set(s.w, 1, s.d);
            s.tag.position.set(-s.w / 2 - 0.5, 0.04, s.d / 2);
            s.mat.opacity = s.shown * 0.55;
            s.lineMat.opacity = s.shown * 0.9;
            const o = String(Math.round(s.shown * 20) / 20);
            if (s.el.style.opacity !== o) s.el.style.opacity = o;
          }
          const view = viewRef.current;
          extMix += ((!view.flow && view.era === "future" ? 1 : 0) - extMix) * slow;
          extMat.opacity = extMix * 0.4;
          extLineMat.opacity = extMix * 0.9;
          for (const part of extParts) part.visible = extMix > 0.02;

          edgeItems.forEach((e, i) => {
            e.mat.opacity += (e.show * e.emph - e.mat.opacity) * k;
            const visible = e.mat.opacity > 0.01;
            e.lineObj.visible = visible;
            if (!visible) e.fresh = false;
            else if (moving || !e.fresh) {
              bend(e);
              e.fresh = !moving;
            }
            const flowing = e.show > 0.5 && e.emph >= 0.3 && !reduce && !moving;
            for (let d = 0; d < DOTS; d++) {
              const o = (i * DOTS + d) * 3;
              if (!flowing) {
                dotPos[o + 1] = 9999; // parked out of sight
                continue;
              }
              e.curve.getPoint((time * 0.22 + e.phase + d / DOTS) % 1, tmp);
              tmp.toArray(dotPos, o);
            }
          });
          dotGeo.attributes.position.needsUpdate = true;

          if (stepCurve && !moving) {
            stepClock += dt;
            // One clear pass per step, then it rests at the far end until the next step.
            const t = reduce ? 1 : Math.min(stepClock / 1.5, 1);
            stepCurve.getPoint(t * t * (3 - 2 * t), packet.position);
            packet.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.5);
            packet.visible = true;
          } else {
            packet.visible = false;
          }

          if (swaying) {
            const azimuth = homeAzimuth + Math.sin(time * 0.28) * 0.26;
            controls.minAzimuthAngle = azimuth;
            controls.maxAzimuthAngle = azimuth;
          }
          controls.update();
          renderer.render(scene, camera);
          labels.render(scene, camera);
        };
        tick();

        // Stop drawing when the stage is off screen or the tab is hidden.
        const setRunning = (on: boolean) => {
          if (on === running) return;
          running = on;
          if (on) {
            clock.getDelta();
            tick();
          } else cancelAnimationFrame(raf);
        };
        let onScreen = true;
        const io = new IntersectionObserver((entries) => {
          // Several changes can arrive in one batch; only the latest is true now.
          onScreen = entries[entries.length - 1].isIntersecting;
          setRunning(onScreen && !document.hidden);
        });
        io.observe(stage);
        const onVisibility = () => setRunning(onScreen && !document.hidden);
        document.addEventListener("visibilitychange", onVisibility);

        cleanup = () => {
          cancelAnimationFrame(raf);
          running = false;
          io.disconnect();
          resize.disconnect();
          themeWatch.disconnect();
          document.removeEventListener("visibilitychange", onVisibility);
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerdown", onDown);
          canvas.removeEventListener("pointerup", onUp);
          canvas.removeEventListener("pointerleave", onLeave);
          controls.dispose();
          for (const d of disposables) d.dispose();
          renderer.dispose();
          canvas.remove();
          labels.domElement.remove();
        };
      })
      .catch((err: unknown) => {
        console.error("architecture scene failed to start", err);
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  const shown = contents.nodes;
  const node = selected ? BY_ID.get(selected) : undefined;
  const near = node ? around(node.id, contents.edges) : null;
  const statuses = (["live", "partial", "planned"] as const).filter((s) => shown.some((n) => n.status === s));

  const nodeButton = (n: ArchNode) => (
    <button
      key={n.id}
      type="button"
      className={styles.part}
      data-status={n.status}
      aria-pressed={selected === n.id}
      onClick={() => chooseNode(n.id)}
    >
      {n.label}
    </button>
  );

  return (
    <section className={styles.scene} aria-label="Architecture diagram">
      <div className={styles.picker} role="group" aria-label="Choose what to look at">
        {FLOWS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={styles.flow}
            data-planned={f.era === "future" ? "" : undefined}
            aria-pressed={flowId === f.id}
            onClick={() => chooseFlow(f.id)}
          >
            {f.label}
            {f.era === "future" && <span className={styles.plannedTag}>planned</span>}
          </button>
        ))}
        <button type="button" className={styles.flow} data-whole="" aria-pressed={flowId === null} onClick={() => chooseFlow(null)}>
          Whole system
        </button>
      </div>

      <div className={styles.stageWrap}>
        <div ref={stageRef} className={styles.stage} data-flow={flow ? "" : undefined}>
          {failed && <p className={styles.fallback}>The 3D view could not start in this browser. Everything it shows is written out beside and below.</p>}
        </div>

        <div className={styles.viewButtons}>
          <button type="button" onClick={() => (commandRef.current = "in")} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => (commandRef.current = "out")} aria-label="Zoom out">
            &minus;
          </button>
          <button type="button" onClick={() => (commandRef.current = "reset")}>
            Reset
          </button>
        </div>

        <div className={styles.topLeft}>
          {!flow && (
            <div className={styles.segment} role="group" aria-label="Which architecture">
              <button type="button" aria-pressed={era === "today"} onClick={() => chooseEra("today")}>
                Today
              </button>
              <button type="button" aria-pressed={era === "future"} onClick={() => chooseEra("future")}>
                Future
              </button>
            </div>
          )}
          <ul className={styles.legend} aria-label="Legend">
            {statuses.map((s) => (
              <li key={s} data-status={s}>
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ul>
        </div>

        <aside className={styles.detail} aria-live="polite">
          {node && near ? (
            <>
              <p className={styles.detailMeta}>
                <span className={styles.status} data-status={node.status}>
                  {STATUS_LABEL[node.status]}
                </span>
                {LAYER_LABEL.get(node.layer)}
              </p>
              <h2>{node.label}</h2>
              <p>{node.what}</p>
              <p className={styles.where}>{node.where}</p>
              {node.roadmap && <p className={styles.roadmap}>Roadmap item {node.roadmap}</p>}
              {near.in.length > 0 && (
                <div className={styles.links}>
                  <h3>Called by</h3>
                  <div>{near.in.map((id) => nodeButton(BY_ID.get(id)!))}</div>
                </div>
              )}
              {near.out.length > 0 && (
                <div className={styles.links}>
                  <h3>Calls</h3>
                  <div>{near.out.map((id) => nodeButton(BY_ID.get(id)!))}</div>
                </div>
              )}
              <button type="button" className={styles.clear} onClick={() => setSelected(null)}>
                {flow ? "Back to the flow" : "Clear selection"}
              </button>
            </>
          ) : flow ? (
            <>
              <p className={styles.detailMeta}>
                {flow.era === "future" && (
                  <span className={styles.status} data-status="planned">
                    Planned
                  </span>
                )}
                Flow &middot; {flow.steps.length} steps
              </p>
              <h2>{flow.label}</h2>
              <p>{flow.summary}</p>
              <div className={styles.player}>
                <button type="button" onClick={() => chooseStep((step - 1 + flow.steps.length) % flow.steps.length)}>
                  Back
                </button>
                <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
                  {playing ? "Pause" : "Play"}
                </button>
                <button type="button" onClick={() => chooseStep((step + 1) % flow.steps.length)}>
                  Next
                </button>
              </div>
              <ol className={styles.steps}>
                {flow.steps.map((s, i) => (
                  <li key={i} data-current={i === step ? "" : undefined} data-done={i < step ? "" : undefined}>
                    <button type="button" onClick={() => chooseStep(i)} aria-current={i === step ? "step" : undefined}>
                      <span className={styles.stepNo}>{i + 1}</span>
                      <span>
                        <span className={styles.stepPath}>
                          {BY_ID.get(s.from)!.label} <span aria-hidden="true">&rarr;</span>
                          <span className={styles.srOnly}> to </span> {BY_ID.get(s.to)!.label}
                        </span>
                        {i === step && <span className={styles.stepSay}>{s.say}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <p className={styles.detailMeta}>{era === "today" ? "What runs today" : "Where it is heading"}</p>
              <h2>{era === "today" ? "Seven layers, one direction" : "The same spine, more around it"}</h2>
              <p>
                {era === "today"
                  ? "Every flow is a path through these layers. Calls only go down: pages call services, services call pure rules and adapters, adapters call vendors."
                  : "Nothing is rebuilt. Planned parts plug into the layers that exist: schedules move into the app, slow work moves to a queue, and three missing stages of the loop get services."}
              </p>
              <p className={styles.hint}>Drag to turn. Select a block for detail.</p>
            </>
          )}
        </aside>
      </div>

      <div className={styles.outline}>
        <h2>{flow ? "The parts in this flow" : "Every part, by layer"}</h2>
        {LAYERS.map((layer) => {
          const parts = shown.filter((n) => n.layer === layer.id);
          if (!parts.length) return null;
          return (
            <div key={layer.id} className={styles.outlineRow}>
              <div>
                <h3>{layer.label}</h3>
                <p>{layer.note}</p>
              </div>
              <div className={styles.parts}>{parts.map(nodeButton)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
