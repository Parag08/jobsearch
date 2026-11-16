import { describe, expect, it } from "vitest";
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
  neighbours,
  nodesFor,
} from "./graph";

const ids = new Set(NODES.map((n) => n.id));

describe("architecture graph - data", () => {
  it("gives every node a unique id and a known layer", () => {
    expect(ids.size).toBe(NODES.length);
    const layers = new Set(LAYERS.map((l) => l.id));
    for (const n of NODES) expect(layers.has(n.layer), n.id).toBe(true);
  });

  it("says what each node is and where it lives", () => {
    for (const n of NODES) {
      expect(n.label.length, n.id).toBeGreaterThan(0);
      expect(n.what.length, n.id).toBeGreaterThan(0);
      expect(n.where.length, n.id).toBeGreaterThan(0);
    }
  });

  it("ties a future node to the roadmap item that builds it", () => {
    for (const n of NODES) {
      if (n.era === "future") expect(n.roadmap, n.id).toMatch(/^[A-Z]+\d+$/);
    }
  });

  it("only connects nodes that exist, once each", () => {
    const seen = new Set<string>();
    for (const e of EDGES) {
      expect(ids.has(e.from), `${e.from} -> ${e.to}`).toBe(true);
      expect(ids.has(e.to), `${e.from} -> ${e.to}`).toBe(true);
      expect(e.from).not.toBe(e.to);
      expect(seen.has(edgeKey(e)), edgeKey(e)).toBe(false);
      seen.add(edgeKey(e));
    }
  });

  it("leaves no node unconnected", () => {
    const touched = new Set(EDGES.flatMap((e) => [e.from, e.to]));
    for (const n of NODES) expect(touched.has(n.id), n.id).toBe(true);
  });
});

describe("architecture graph - eras", () => {
  it("shows nothing from the future in today's view", () => {
    for (const n of nodesFor("today")) expect(n.era).toBe("today");
    const today = new Set(nodesFor("today").map((n) => n.id));
    for (const e of edgesFor("today")) {
      expect(e.era).toBe("today");
      expect(today.has(e.from) && today.has(e.to), edgeKey(e)).toBe(true);
    }
  });

  it("keeps every node in the future view and drops only the edges that retire", () => {
    expect(nodesFor("future")).toHaveLength(NODES.length);
    const retiring = EDGES.filter((e) => e.retires);
    expect(retiring.length).toBeGreaterThan(0);
    expect(edgesFor("future")).toHaveLength(EDGES.length - retiring.length);
    for (const e of retiring) expect(e.era, edgeKey(e)).toBe("today");
  });

  it("never draws a today edge to a node that does not exist yet", () => {
    const era = new Map(NODES.map((n) => [n.id, n.era]));
    for (const e of EDGES) {
      if (e.era === "today") {
        expect(era.get(e.from), edgeKey(e)).toBe("today");
        expect(era.get(e.to), edgeKey(e)).toBe("today");
      }
    }
  });
});

describe("architecture graph - flows", () => {
  it("walks only edges that exist in the flow's own era", () => {
    for (const f of FLOWS) {
      const available = new Set(edgesFor(f.era).map(edgeKey));
      expect(f.steps.length, f.id).toBeGreaterThan(1);
      for (const s of f.steps) {
        expect(available.has(edgeKey(s)), `${f.id}: ${s.from} -> ${s.to}`).toBe(true);
      }
    }
  });

  it("explains every step in a sentence", () => {
    for (const f of FLOWS) {
      for (const s of f.steps) expect(s.say.length, `${f.id}: ${s.from} -> ${s.to}`).toBeGreaterThan(10);
    }
  });

  it("stays small enough to read at a glance", () => {
    for (const f of FLOWS) expect(flowNodes(f).length, f.id).toBeLessThanOrEqual(12);
  });

  it("starts each step somewhere the flow has already been, after the first", () => {
    for (const f of FLOWS) {
      const reached = new Set([f.steps[0].from]);
      for (const s of f.steps) {
        expect(reached.has(s.from), `${f.id}: ${s.from} -> ${s.to}`).toBe(true);
        reached.add(s.to);
      }
    }
  });

  it("has unique flow ids", () => {
    expect(new Set(FLOWS.map((f) => f.id)).size).toBe(FLOWS.length);
  });

  it("lays each flow out on its own: every part placed once, layers in order", () => {
    for (const f of FLOWS) {
      const placed = layoutFlow(f);
      const parts = flowNodes(f);
      expect(placed.nodes.size, f.id).toBe(parts.length);
      const spots = new Set(parts.map((n) => Object.values(placed.nodes.get(n.id)!).join("|")));
      expect(spots.size, f.id).toBe(parts.length);
      const ys = LAYERS.filter((l) => placed.layers.has(l.id)).map((l) => placed.layers.get(l.id)!.y);
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
      for (const n of parts) expect(placed.nodes.get(n.id)!.y).toBe(placed.layers.get(n.layer)!.y);
    }
  });
});

describe("architecture graph - neighbours", () => {
  it("lists what a node calls and what calls it, within the era", () => {
    const today = neighbours("llm", "today");
    expect(today.out).toContain("models");
    expect(today.in).toContain("intake");
    expect(today.out).not.toContain("obs");
    expect(neighbours("llm", "future").out).toContain("obs");
  });
});

describe("architecture graph - layout", () => {
  const placed = layoutGraph();

  it("places every node", () => {
    expect(placed.nodes.size).toBe(NODES.length);
  });

  it("stacks the layers top to bottom in order", () => {
    const ys = LAYERS.map((l) => placed.layers.get(l.id)!.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
  });

  it("puts today's nodes on their slab and planned nodes on its extension", () => {
    for (const n of NODES) {
      const p = placed.nodes.get(n.id)!;
      const slab = placed.layers.get(n.layer)!;
      expect(p.y).toBe(slab.y);
      expect(Math.abs(p.z), n.id).toBeLessThanOrEqual(slab.depth / 2);
      if (n.era === "today") {
        expect(Math.abs(p.x), n.id).toBeLessThanOrEqual(slab.width / 2);
      } else {
        expect(p.x, n.id).toBeGreaterThan(slab.width / 2);
        expect(Math.abs(p.x - slab.extension.x), n.id).toBeLessThanOrEqual(slab.extension.width / 2);
      }
    }
  });

  it("keeps today's picture centred", () => {
    for (const l of LAYERS) {
      const xs = NODES.filter((n) => n.layer === l.id && n.era === "today").map((n) => placed.nodes.get(n.id)!.x);
      expect(Math.abs(Math.min(...xs) + Math.max(...xs)), l.id).toBeLessThan(1e-9);
    }
  });

  it("never puts two nodes in the same place", () => {
    const seen = new Set<string>();
    for (const n of NODES) {
      const p = placed.nodes.get(n.id)!;
      const key = `${p.x.toFixed(2)}|${p.y.toFixed(2)}|${p.z.toFixed(2)}`;
      expect(seen.has(key), n.id).toBe(false);
      seen.add(key);
    }
  });

  it("does not move today's nodes when the future ones arrive", () => {
    // Layout is computed over the whole graph, with today's nodes first on each layer.
    for (const l of LAYERS) {
      const onLayer = NODES.filter((n) => n.layer === l.id);
      const firstFuture = onLayer.findIndex((n) => n.era === "future");
      if (firstFuture === -1) continue;
      for (const n of onLayer.slice(firstFuture)) expect(n.era, n.id).toBe("future");
    }
  });
});
