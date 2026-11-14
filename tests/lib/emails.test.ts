import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as indexRoute } from "@/app/dev/emails/route";
import { GET as emailRoute } from "@/app/dev/emails/[name]/route";
import { SAMPLE_NAMES, SAMPLE_TOKEN, sampleEmails } from "@/lib/email-samples";
import { renderLayout } from "@/lib/email-layout";
import { firstName } from "@/lib/names";
import { renderPasswordReset } from "@/modules/auth/emails";
import { renderInvitationEmail } from "@/modules/invitations/templates";
import { renderMemberInvite } from "@/modules/members/emails";

// The four emails (password reset, member invite, wedding invitation, reminder) and the shared
// layout. Pure functions on strings: no database, no transport, nothing is sent.

const APP = "http://localhost:3000";
const MAP_LINKS = ["https://maps.example.com/haldi", "https://maps.example.com/reception"];
const samples = sampleEmails(APP);
const all = Object.entries(samples);

/** Every address that appears in the text, with `&amp;` read back as `&`. */
const urlsIn = (value: string) =>
  [...value.replaceAll("&amp;", "&").matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]);

describe("every email", () => {
  it.each(all)("%s follows the shared design", (_name, mail) => {
    const { html } = mail;
    expect(html).toMatch(/^<!doctype html>/i);
    // Light only, a 600px card, ivory page, champagne rule, plum button.
    expect(html).toContain('<meta name="color-scheme" content="light only">');
    expect(html).toContain("max-width:600px");
    expect(html).toContain("#FAF8F5");
    expect(html).toContain("#E4DEE8");
    expect(html).toContain("border-radius:12px");
    expect(html).toContain("border-top:1px solid #C8A97E");
    expect(html).toContain('bgcolor="#2A1B3D"');
    expect(html).toContain("Georgia, 'Times New Roman', serif");
    expect(html).toContain("Inter, Arial, Helvetica, sans-serif");
    expect(html).toContain(">Make My Marriage</td>");
    // A 48px button: 14px + a 20px line + 14px.
    expect(html).toMatch(/padding:14px 28px;[^"]*line-height:20px/);
    expect(html).toContain("Or paste this link into your browser:");
    // A hidden preheader.
    expect(html).toMatch(/display:none;[^"]*mso-hide:all/);
  });

  it.each(all)("%s has no images, scripts, style blocks, fonts or remote files", (_name, mail) => {
    for (const part of [mail.html, mail.text]) {
      expect(part).not.toMatch(/<img|<link|<script|<style|<iframe|<video|<audio|<object/i);
      expect(part).not.toMatch(/url\(|@import|@font-face|background="|src=/i);
    }
  });

  it.each(all)(
    "%s links only to the app and, in an invitation, the guest's maps link",
    (_name, mail) => {
      for (const part of [mail.html, mail.text]) {
        for (const url of urlsIn(part)) {
          expect(url.startsWith(APP) || MAP_LINKS.includes(url), url).toBe(true);
        }
      }
      // Every link is a full address, in the plain text too.
      expect(urlsIn(mail.text).length).toBeGreaterThan(0);
    },
  );

  it.each(all)(
    "%s says replies are not read, in both parts, and sets no Reply-To",
    (_name, mail) => {
      expect(mail.text).toContain("replies are not read");
      expect(mail.html).toContain("replies are not read");
      expect(mail).not.toHaveProperty("replyTo");
    },
  );

  it.each(all)("%s has a plain-text part with the footer and no marketing", (_name, mail) => {
    expect(mail.text).toMatch(
      /\n(Sent by )?Make My Marriage( for .+)?\. This is an automatic email, so replies are not read\.$/,
    );
    for (const part of [mail.html, mail.text]) {
      expect(part).not.toMatch(/unsubscribe|newsletter|follow us|facebook|instagram|twitter/i);
    }
  });
});

describe("password reset", () => {
  const mail = samples.reset!;
  const link = `${APP}/reset-password?token=${SAMPLE_TOKEN}`;

  it("keeps the subject and the content, with the first name only", () => {
    expect(mail.subject).toBe("Reset your Make My Marriage password");
    expect(mail.text).toContain("Hi Radha,");
    expect(mail.text).not.toContain("Reddy");
    expect(mail.text).toContain("It works once and expires in 1 hour.");
    expect(mail.text).toContain("If you didn't ask for this, you can ignore this email.");
    expect(mail.html).toContain(">Reset your password</a>");
  });

  it("has the link on the button, as plain text under it, and in the text part", () => {
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain(`word-break:break-all;color:#6B6474;">${link}</span>`);
    expect(mail.text).toContain(`\n${link}\n`);
  });

  it("is an account email: the footer is the name, and says replies are not read", () => {
    expect(
      mail.text.endsWith(
        "\nMake My Marriage. This is an automatic email, so replies are not read.",
      ),
    ).toBe(true);
    expect(mail.html).not.toContain("Sent by");
  });

  it("escapes the name", () => {
    const evil = renderPasswordReset({ name: `<script>alert(1)</script> Q`, link });
    expect(evil.html).not.toContain("<script");
    expect(evil.html).toContain("Hi &lt;script&gt;alert(1)&lt;/script&gt;,");
  });
});

describe("member invite", () => {
  const mail = samples["member-invite"]!;

  it("says who invited them, which wedding, the role and the expiry", () => {
    expect(mail.subject).toBe(
      "Radha Reddy invited you to plan Radha & Krishna on Make My Marriage",
    );
    expect(mail.text).toContain("Hi Anil,");
    expect(mail.text).not.toContain("Kumar");
    expect(mail.text).toContain(
      "Radha Reddy has invited you to help plan the wedding of Radha & Krishna as a Manager.",
    );
    expect(mail.text).toContain("The link works once and expires in 7 days.");
    expect(mail.html).toContain(">Accept invitation</a>");
    expect(mail.html).toContain("Radha &amp; Krishna");
  });

  it("has the link on the button and in the plain text, and a wedding footer", () => {
    const link = `${APP}/accept-invite?token=${SAMPLE_TOKEN}`;
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.text).toContain(`\n${link}\n`);
    expect(
      mail.text.endsWith(
        "\nSent by Make My Marriage for Radha & Krishna. This is an automatic email, so replies are not read.",
      ),
    ).toBe(true);
    expect(mail.html).toContain(
      "Sent by Make My Marriage for Radha &amp; Krishna. This is an automatic email, so replies are not read.",
    );
  });

  it("calls an Admin an Admin, and escapes everything the inviter typed", () => {
    const evil = `<img src=x onerror=alert(1)>`;
    const m = renderMemberInvite({
      name: "Anil",
      invitedBy: evil,
      weddingName: `"><script>alert(1)</script>`,
      role: "admin",
      link: `${APP}/accept-invite?token=t`,
    });
    expect(m.text).toContain("as an Admin.");
    expect(m.html).not.toMatch(/<img|<script/i);
    expect(m.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps the subject on one line", () => {
    const m = renderMemberInvite({
      name: "A",
      invitedBy: "Bob\r\nBcc: x@evil.example",
      weddingName: "W",
      role: "manager",
      link: `${APP}/accept-invite?token=t`,
    });
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
});

describe("wedding invitation", () => {
  const mail = samples.invitation!;
  const link = `${APP}/i/${SAMPLE_TOKEN}`;

  it("has the subject, the heading, the date and the guest's first name", () => {
    expect(mail.subject).toBe("You are invited to Radha & Krishna's wedding");
    expect(mail.html).toContain("YOU ARE INVITED");
    expect(mail.html).toContain("Radha &amp; Krishna");
    expect(mail.html).toContain("14 February 2027");
    expect(mail.text).toContain("Dear D'Souza & Family,");
    expect(mail.html).toContain("Dear <strong");
    expect(mail.html).toContain("D&#39;Souza");
  });

  it("has one card per event, with the dress code and map link only where they exist", () => {
    for (const name of ["Haldi", "Muhurtham", "Reception"]) expect(mail.text).toContain(name);
    expect(mail.html.match(/border-radius:10px/g)).toHaveLength(3);
    expect(mail.text).toContain("Saturday, 13 February 2027 at 10:00 AM");
    expect(mail.text).toContain("Sunday, 14 February 2027 at 6:45 AM");
    expect(mail.text).toContain("Monday, 15 February 2027 at 7:00 PM");
    expect(mail.html.match(/Dress code:/g)).toHaveLength(2);
    expect(mail.html.match(/>Open in Maps</g)).toHaveLength(2);
    expect(mail.text).toContain("Open in Maps: https://maps.example.com/haldi");
    expect(mail.html).toContain('href="https://maps.example.com/reception" target="_blank"');
    // Long venue and address are in, and can wrap.
    expect(mail.text).toContain("Banjara Hills");
    expect(mail.text).toContain("Extremely-Long-Street-Name-Without-Spaces");
  });

  it("has the cut-off, the button with the guest's own link, and no website link", () => {
    expect(mail.text).toContain("Please reply by 20 January 2027.");
    expect(mail.html).toContain("Please reply by 20 January 2027.");
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain(">View invitation and reply</a>");
    expect(mail.text).toContain(`View invitation and reply:\n${link}\n`);
    expect(mail.text).toContain("This link is only for you. Please do not share it.");
    expect(mail.text).not.toContain("Wedding website");
    expect(mail.html).not.toContain("Wedding website");
    expect(
      mail.text.endsWith(
        "\nSent by Make My Marriage for Radha & Krishna. This is an automatic email, so replies are not read.",
      ),
    ).toBe(true);
  });

  it("shows the website link only when there is one", () => {
    const withSite = renderInvitationEmail({
      kind: "invite",
      brideName: "Radha",
      groomName: "Krishna",
      weddingDate: "2027-02-14",
      guestName: "Meena",
      events: [{ name: "Haldi", date: "2027-02-13", time: "10:00", venueName: "Hall" }],
      websiteUrl: `${APP}/w/radha-krishna`,
      inviteUrl: link,
    });
    expect(withSite.text).toContain(`Wedding website: ${APP}/w/radha-krishna`);
    expect(withSite.html).toContain(`href="${APP}/w/radha-krishna"`);
  });

  it("lists only the events it is given, and says 'event' for one", () => {
    const one = renderInvitationEmail({
      kind: "invite",
      brideName: "Radha",
      groomName: "Krishna",
      weddingDate: "2027-02-14",
      guestName: "Meena",
      events: [{ name: "Reception", date: "2027-02-15", time: "19:00", venueName: "Hall" }],
      inviteUrl: link,
    });
    expect(one.text).toContain("You are invited to:");
    expect(one.text).toContain("Reception");
    expect(one.text).not.toContain("Haldi");
    expect(one.html.match(/border-radius:10px/g)).toHaveLength(1);
  });

  it("escapes every value a member typed", () => {
    const evil = `<script>alert("x")</script>`;
    const m = renderInvitationEmail({
      kind: "invite",
      brideName: evil,
      groomName: `"><img src=x onerror=alert(1)>`,
      weddingDate: "2027-02-14",
      guestName: `<b>${evil}</b>`,
      events: [
        {
          name: `<i>${evil}</i>`,
          date: "2027-02-11",
          time: "19:30",
          venueName: `A & B "Hall" <u>`,
          address: `<a href="javascript:alert(1)">x</a>`,
          dressCode: `'><svg onload=alert(1)>`,
          mapLink: `https://maps.example.com/?q=a"b&c=<d>`,
        },
      ],
      inviteUrl: link,
    });
    expect(m.html).not.toMatch(/<script|<img|<svg|<i>|<u>|<b>|<a href="javascript/i);
    expect(m.html).toContain("A &amp; B &quot;Hall&quot; &lt;u&gt;");
    const hrefs = [...m.html.matchAll(/href="([^"]*)"/g)].map((h) => h[1]!);
    expect(hrefs.every((h) => !/[<>"]/.test(h))).toBe(true);
  });
});

describe("reminder", () => {
  const mail = samples.reminder!;

  it("has its own subject and heading, in the same layout", () => {
    expect(mail.subject).toBe("Reminder: please reply to Radha & Krishna's invitation");
    expect(mail.html).toContain("A gentle reminder");
    expect(mail.html).not.toContain("YOU ARE INVITED");
    expect(mail.text).toContain("This is a friendly reminder.");
    expect(mail.text).toContain("Dear D'Souza & Family,");
  });

  it("lists only the events it is given: the ones not answered yet", () => {
    expect(mail.text).toContain("Muhurtham");
    expect(mail.text).toContain("Reception");
    expect(mail.text).not.toContain("Haldi");
    expect(mail.html.match(/border-radius:10px/g)).toHaveLength(2);
  });

  it("has the same button and link", () => {
    const link = `${APP}/i/${SAMPLE_TOKEN}`;
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain(">View invitation and reply</a>");
    expect(mail.text).toContain(`View invitation and reply:\n${link}\n`);
  });
});

describe("the layout", () => {
  it("escapes the title, the preheader and the footer", () => {
    const html = renderLayout({
      title: `<b>t</b>`,
      preheader: `<i>p</i>`,
      bodyHtml: "<p>x</p>",
      footer: `<u>f</u>`,
    });
    expect(html).toContain("&lt;b&gt;t&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;p&lt;/i&gt;");
    expect(html).toContain("&lt;u&gt;f&lt;/u&gt;");
    expect(html).not.toMatch(/<b>|<i>|<u>/);
  });

  it("takes the first word of a name", () => {
    expect(firstName("Meena Reddy")).toBe("Meena");
    expect(firstName("  Meena  ")).toBe("Meena");
    expect(firstName("Meena")).toBe("Meena");
    expect(firstName("")).toBe("");
  });

  it("greets a title, a couple or a family by the whole name, never 'Dear Mr.'", () => {
    for (const name of [
      "Dr. Rao",
      "Mr Anil Kumar",
      "Mrs. Lakshmi Rao",
      "Prof. S. Iyer",
      "Mr. & Mrs. Iyer",
      "The Sharma Family",
      "Anil and Sunita",
      "Ravi + Priya",
      "D'Souza & Family",
      "Reddy Family",
    ]) {
      expect(firstName(name), name).toBe(name);
    }
    expect(firstName("Drake Rao")).toBe("Drake"); // starts like a title but is not one
    expect(firstName("Anderson Cooper")).toBe("Anderson");
    expect(firstName("Sunita Mrs")).toBe("Sunita");
  });

  it("puts the whole name in the emails for a family, in both parts", () => {
    const mail = renderInvitationEmail({
      kind: "invite",
      brideName: "Radha",
      groomName: "Krishna",
      weddingDate: "2027-02-14",
      guestName: "Mr. & Mrs. Iyer",
      events: [{ name: "Haldi", date: "2027-02-13", time: "10:00", venueName: "Hall" }],
      inviteUrl: "https://a.example/i/t",
    });
    expect(mail.text).toContain("Dear Mr. & Mrs. Iyer,");
    expect(mail.html).toContain("Mr. &amp; Mrs. Iyer");
    expect(mail.text).not.toContain("Dear Mr.,");
  });
});

describe("the development preview", () => {
  afterEach(() => vi.unstubAllEnvs());

  const ask = (name: string, query = "") =>
    emailRoute(new Request(`${APP}/dev/emails/${name}${query}`), {
      params: Promise.resolve({ name }),
    } as never);

  it("shows each email as an HTML page, or as plain text, outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const name of SAMPLE_NAMES) {
      const page = await ask(name);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(page.headers.get("x-robots-tag")).toBe("noindex");
      const html = await page.text();
      expect(html).toContain("Make My Marriage");
      expect(html).not.toMatch(/<img/i);
      const text = await ask(name, "?text=1");
      expect(text.headers.get("content-type")).toContain("text/plain");
      expect(await text.text()).toContain(SAMPLE_TOKEN);
    }
    const list = indexRoute();
    expect(list.status).toBe(200);
    const body = await list.text();
    for (const name of SAMPLE_NAMES) expect(body).toContain(`/dev/emails/${name}`);
  });

  it("answers 404 for an unknown email", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const name of ["nope", "__proto__", "constructor", "toString"]) {
      expect((await ask(name)).status, name).toBe(404);
    }
  });

  it("answers 404 in production, for the list and for every email", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(indexRoute().status).toBe(404);
    for (const name of SAMPLE_NAMES) {
      const res = await ask(name);
      expect(res.status, name).toBe(404);
      expect(await res.text()).toBe("");
    }
  });
});

describe("writing the emails to a folder", () => {
  it("renders each email to <temp>/mmm-emails as .html and .txt, to open in a browser", () => {
    const dir = join(tmpdir(), "mmm-emails");
    mkdirSync(dir, { recursive: true });
    for (const [name, mail] of all) {
      writeFileSync(join(dir, `${name}.html`), mail.html, "utf8");
      writeFileSync(join(dir, `${name}.txt`), `Subject: ${mail.subject}\n\n${mail.text}\n`, "utf8");
    }
    for (const [name, mail] of all) {
      expect(readFileSync(join(dir, `${name}.html`), "utf8")).toBe(mail.html);
    }
    console.info(`Emails written to ${dir}`);
  });
});
