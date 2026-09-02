import { describe, it, expect } from "vitest";
import { detectTags, importCvbuilder, type CvbSource } from "./cvbuilder";

/** Minimal stand-ins for the data/cvbuilder/*.json files (the real data is exercised in real-data.test.ts). */
const taxonomy = {
  families: { Product: ["product-management"], Technical: ["backend"] },
  tags: {
    "product-management": ["product manager", "product management"],
    backend: ["backend", "api"],
    revenue: ["revenue", "arr"],
  },
};

const profile = {
  name: { first: "Ada", last: "LOVELACE" },
  contactLines: ["ada@example.com", "+65 10000000"],
  education: [
    {
      id: "school",
      org: "INSEAD",
      location: "Singapore/France",
      blurb: "",
      roles: [{ id: "school-mba", title: "MBA Class of December 2026", dates: "2026" }],
    },
  ],
  experience: [
    {
      id: "acme",
      org: "Acme",
      location: "Singapore",
      blurb: "Acme builds things",
      roles: [{ id: "acme-pm", title: "Product Manager", dates: "2024 - 2026" }],
    },
  ],
  additional: [
    { id: "add-auth", label: "Nationality/Authorisation", text: "British; Singapore Student Visa", locked: true },
    { id: "add-skills", label: "Skills", text: "Leadership | Product Management", locked: false, tailorable: true },
  ],
};

const points = {
  points: [
    {
      id: "acme-launch",
      roleId: "acme-pm",
      text: "Launched the API product, adding $2M revenue",
      variants: [{ label: "short", text: "Launched the API product (+$2M revenue)" }],
      tags: ["product-management", "revenue"],
      strength: 5,
      status: "active",
      inMaster: true,
    },
    {
      id: "acme-backend",
      roleId: "acme-pm",
      text: "Rebuilt the backend",
      variants: [],
      tags: ["backend"],
      strength: 3,
      status: "active",
      inMaster: true,
    },
    {
      id: "acme-old",
      roleId: "acme-pm",
      text: "Something retired",
      variants: [],
      tags: ["backend"],
      strength: 1,
      status: "retired",
      inMaster: false,
    },
    {
      id: "school-club",
      roleId: "school-mba",
      text: "President of the product club",
      variants: [],
      tags: ["product-management"],
      strength: 4,
      status: "active",
      inMaster: true,
    },
  ],
};

const archetypes = {
  archetypes: [
    {
      id: "product-management",
      label: "Product Management",
      targetRoles: "PM roles",
      budget: 15,
      pin: ["acme-launch"],
      exclude: [],
      variants: { "acme-backend": "short" },
      evidence: [
        { id: "seed-pm", kind: "seed", weight: 1, text: "We are hiring a product manager to own the roadmap." },
        { id: "jd-globex", kind: "jd", weight: 1, fromApplication: "globex-product-manager" },
      ],
    },
    {
      id: "engineering-manager",
      label: "Engineering Management",
      targetRoles: "EM roles",
      budget: 15,
      pin: [],
      exclude: [],
      variants: {},
      evidence: [{ id: "seed-em", kind: "seed", weight: 1, text: "You will lead a backend team." }],
    },
  ],
};

const applications = [
  {
    id: "archetype-product-management",
    company: "",
    role: "Product Management - base CV",
    jd: "",
    generatedFrom: { archetype: "product-management", at: "2026-09-01T00:00:00.000Z" },
    selection: { points: [{ pointId: "school-club", variant: null }, { pointId: "acme-launch", variant: null }] },
  },
  {
    id: "archetype-engineering-manager",
    company: "",
    role: "Engineering Management - base CV",
    jd: "",
    generatedFrom: { archetype: "engineering-manager", at: "2026-09-01T00:00:00.000Z" },
    selection: { points: [{ pointId: "school-club", variant: null }, { pointId: "acme-backend", variant: null }] },
  },
  {
    id: "master",
    company: "",
    role: "Master CV",
    jd: "",
    selection: { points: [{ pointId: "school-club", variant: null }, { pointId: "acme-backend", variant: null }] },
  },
  {
    id: "globex-product-manager",
    company: "Globex",
    role: "Product Manager",
    jd: "Globex is hiring a product manager in Singapore. You will own product management for our platform and drive revenue.",
    updatedAt: "2026-08-20T10:00:00.000Z",
    selection: {
      points: [
        { pointId: "acme-launch", variant: "short", overrideText: null },
        { pointId: "acme-backend", variant: null, overrideText: null },
      ],
    },
  },
];

const src: CvbSource = { profile, points, taxonomy, archetypes, applications };
const opts = { userId: "11111111-1111-1111-1111-111111111111", today: "2026-09-02" };

describe("detectTags", () => {
  it("finds taxonomy tags and the phrases that matched", () => {
    const hits = detectTags("We need a Product Manager to grow revenue.", taxonomy);
    expect(hits.tags).toEqual(["product-management", "revenue"]);
    expect(hits.phrases).toEqual(["product manager", "revenue"]);
  });

  it("matches single words on a boundary, not inside another word", () => {
    expect(detectTags("apint apibackendish", taxonomy).tags).toEqual([]);
    expect(detectTags("our api layer", taxonomy).tags).toEqual(["backend"]);
  });
});

describe("importCvbuilder", () => {
  const ws = importCvbuilder(src, opts);
  const bulletId = (prefix: string) =>
    ws.projects.flatMap((p) => p.bullets).find((b) => b.text.startsWith(prefix))!.id;

  it("maps the profile, keeping contact lines, visa context and CV extras", () => {
    expect(ws.profile).toMatchObject({
      userId: opts.userId,
      displayName: "Ada Lovelace",
      targetGeos: ["Singapore"],
      visaContext: "British; Singapore Student Visa",
    });
    expect(ws.profile.roleFamilies).toContain("product-management");
    expect(ws.profile.contactLines).toEqual(["ada@example.com", "+65 10000000"]);
    expect(ws.profile.cvExtras).toEqual(profile.additional);
    expect(ws.profile.networks).toContainEqual({
      name: "INSEAD",
      program: "MBA Class of December 2026",
      location: "Singapore/France",
    });
  });

  it("turns every CV role into a project carrying its own bullets", () => {
    const acme = ws.projects.find((p) => p.org === "Acme");
    expect(acme).toBeDefined();
    expect(acme!.role).toBe("Product Manager");
    expect(acme!.dates).toBe("2024 - 2026");
    expect(acme!.narrative).toBe("Acme builds things");
    expect(acme!.bullets.map((b) => b.text)).toEqual([
      "Launched the API product, adding $2M revenue",
      "Rebuilt the backend",
    ]);
    expect(acme!.skills).toEqual(["backend", "product-management", "revenue"]);
    expect(ws.projects.map((p) => p.org)).toEqual(["Acme", "INSEAD"]);
  });

  it("drops non-active points and says so", () => {
    const all = ws.projects.flatMap((p) => p.bullets);
    expect(all.find((b) => b.text === "Something retired")).toBeUndefined();
    expect(ws.warnings.join(" ")).toContain("acme-old");
  });

  it("carries variants and strength onto the bullet", () => {
    const bullet = ws.projects.flatMap((p) => p.bullets).find((b) => b.text.startsWith("Launched"))!;
    expect(bullet.variants).toEqual([{ label: "short", text: "Launched the API product (+$2M revenue)" }]);
    expect(bullet.strength).toBe(5);
  });

  it("gives a bullet the role family that pins or re-angles it, else general", () => {
    expect(bulletId("Launched")).toBeTruthy();
    const byPrefix = (p: string) =>
      ws.projects.flatMap((b) => b.bullets).find((b) => b.text.startsWith(p))!;
    expect(byPrefix("Launched").roleFamily).toBe("product-management"); // pinned
    expect(byPrefix("Rebuilt").roleFamily).toBe("product-management"); // variant override
    expect(byPrefix("President").roleFamily).toBe("general"); // selected everywhere, owned by nobody
  });

  it("builds one master CV per archetype from its base-CV selection", () => {
    const pm = ws.masterCvs.find((m) => m.roleFamily === "product-management")!;
    expect(pm.bulletIds).toEqual([bulletId("President"), bulletId("Launched")]);
    expect(pm.summaryLine).toContain("Ada Lovelace");
    expect(pm.summaryLine).toContain("Product Management");
  });

  it("imports master.json as the general master CV", () => {
    expect(ws.masterCvs.find((m) => m.roleFamily === "general")).toBeDefined();
  });

  it("imports a real application with a lexically-derived JD extract", () => {
    expect(ws.applications).toHaveLength(1);
    const { application, jdRaw, cv } = ws.applications[0];
    expect(application.company).toBe("Globex");
    expect(application.stage).toBe("saved");
    expect(application.savedAt).toBe("2026-08-20");
    expect(jdRaw).toBe(applications.find((a) => a.id === "globex-product-manager")!.jd);
    expect(application.jdExtract).toMatchObject({
      company: "Globex",
      role: "Product Manager",
      roleFamily: "product-management", // via the archetype's fromApplication link
      location: "Singapore",
    });
    expect(application.jdExtract!.skills).toEqual(["product-management", "revenue"]);
    expect(application.jdExtract!.sectorPath).toEqual(["Product Management", "Singapore"]);
    expect(cv).not.toBeNull();
    expect(application.cvVersionId).toBe(cv!.id);
  });

  it("records the CV that was actually sent as a diff from the family master", () => {
    const { cv } = ws.applications[0];
    expect(cv!.bulletIds).toEqual([bulletId("Launched"), bulletId("Rebuilt")]);
    expect(cv!.diff.addBulletIds).toEqual([bulletId("Rebuilt")]);
    expect(cv!.diff.removeBulletIds).toEqual([bulletId("President")]);
    expect(cv!.diff.variants).toEqual({ [bulletId("Launched")]: "short" });
    // honesty rule: only keywords the bullet bank can back
    expect(cv!.diff.keywordsToMirror).toEqual(["revenue"]);
  });

  it("skips base CVs, master and generic when collecting applications", () => {
    expect(ws.applications.map((a) => a.application.company)).toEqual(["Globex"]);
  });

  it("opens a sector node per role family and geography, summarised", () => {
    const sector = ws.sectors.find((s) => s.path.join(">") === "Product Management>Singapore")!;
    expect(sector.companies).toEqual(["Globex"]);
    expect(sector.titles).toEqual(["Product Manager"]);
    expect(sector.jdCount).toBe(1);
    expect(sector.skills).toMatchObject({ "product-management": 1, revenue: 1 });
    expect(sector.summary).toContain("Globex");
  });

  it("is deterministic: the same input yields the same ids", () => {
    const again = importCvbuilder(src, opts);
    expect(again).toEqual(ws);
    expect(ws.projects[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
