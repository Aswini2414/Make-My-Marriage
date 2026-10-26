import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LandingPage from "@/app/(marketing)/page";

const html = renderToStaticMarkup(createElement(LandingPage));

describe("landing page", () => {
  it("has exactly one main heading", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("Your wedding, <em");
  });

  it("points every in-page link at a section that exists", () => {
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const id of new Set(targets)) {
      expect(html, `#${id} has no matching section`).toContain(`id="${id}"`);
    }
  });

  it("sends visitors to sign up and log in", () => {
    expect(html).toContain('href="/signup"');
    expect(html).toContain('href="/login"');
  });
});
