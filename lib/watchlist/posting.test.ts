import { describe, it, expect } from "vitest";
import { htmlToText, postingEndpoint, postingText } from "./posting";

describe("postingEndpoint", () => {
  it("names the one-posting URL for each board", () => {
    expect(postingEndpoint("greenhouse", "stripe", "123")).toBe("https://boards-api.greenhouse.io/v1/boards/stripe/jobs/123");
    expect(postingEndpoint("lever", "grab", "abc")).toBe("https://api.lever.co/v0/postings/grab/abc");
    expect(postingEndpoint("smartrecruiters", "Acme", "9")).toBe("https://api.smartrecruiters.com/v1/companies/Acme/postings/9");
  });
  it("uses the whole board for Ashby, which has no one-posting endpoint", () => {
    expect(postingEndpoint("ashby", "kestrel", "x")).toBe("https://api.ashbyhq.com/posting-api/job-board/kestrel");
  });
});

describe("htmlToText", () => {
  it("decodes Greenhouse's escaped HTML and keeps paragraphs and bullets", () => {
    const html = "&lt;p&gt;Own the roadmap.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;li&gt;5+ years &amp;amp; more&lt;/li&gt;&lt;/ul&gt;";
    expect(htmlToText(html)).toBe("Own the roadmap.\n- SQL\n- 5+ years & more");
  });
  it("leaves plain text alone", () => {
    expect(htmlToText("Just text.\n\nTwo lines.")).toBe("Just text.\n\nTwo lines.");
  });
});

describe("postingText", () => {
  it("Greenhouse: title plus content", () => {
    expect(postingText("greenhouse", { title: "PM", content: "&lt;p&gt;Lead payments.&lt;/p&gt;" }, "1", "Stripe")).toBe(
      "PM\nCompany: Stripe\n\nLead payments.",
    );
  });
  it("Lever: description plus each list", () => {
    const raw = { text: "PM", descriptionPlain: "About us.", lists: [{ text: "You have", content: "<li>SQL</li>" }], additionalPlain: "Hybrid." };
    expect(postingText("lever", raw, "a", "Grab")).toBe("PM\nCompany: Grab\n\nAbout us.\n\nYou have\n- SQL\n\nHybrid.");
  });
  it("Ashby: finds the posting on the board by id", () => {
    const raw = { jobs: [{ id: "x", title: "Other", descriptionPlain: "no" }, { id: "y", title: "PM", descriptionPlain: "Yes." }] };
    expect(postingText("ashby", raw, "y", "Kestrel")).toBe("PM\nCompany: Kestrel\n\nYes.");
  });
  it("SmartRecruiters: the job ad sections in order", () => {
    const raw = { name: "PM", jobAd: { sections: { jobDescription: { text: "<p>Do it.</p>" }, qualifications: { text: "<p>Be it.</p>" } } } };
    expect(postingText("smartrecruiters", raw, "9", "Acme")).toBe("PM\nCompany: Acme\n\nDo it.\n\nBe it.");
  });
  it("is null when the board gave no text, so the caller can ask for a paste", () => {
    expect(postingText("greenhouse", { title: "PM" }, "1", "S")).toBeNull();
    expect(postingText("ashby", { jobs: [] }, "y", "K")).toBeNull();
    expect(postingText("unknown", {}, "1", "K")).toBeNull();
  });
});
