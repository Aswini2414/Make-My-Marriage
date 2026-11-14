import { renderInvitationEmail, type EmailEvent } from "@/modules/invitations/templates";
import { renderMemberInvite } from "@/modules/members/emails";
import { renderPasswordReset } from "@/modules/auth/emails";

// Sample data for each email, used by the development preview (/dev/emails) and by the tests that
// write the rendered emails to a folder. Nothing here is real: the links carry a made-up token.

export type RenderedSample = { subject: string; html: string; text: string };

/** A made-up token, so a sample link can be found in the output. */
export const SAMPLE_TOKEN = "SAMPLE-TOKEN-not-a-real-link-0000000000";

/** Three events, one with a very long venue and address and no dress code, one with markup in it. */
export const SAMPLE_EVENTS: EmailEvent[] = [
  {
    name: "Haldi",
    date: "2027-02-13",
    time: "10:00",
    venueName: "Radha's Residence (Courtyard)",
    address: "Plot 42, Jubilee Hills, Hyderabad",
    dressCode: "Yellow, traditional",
    mapLink: "https://maps.example.com/haldi",
  },
  {
    name: "Muhurtham",
    date: "2027-02-14",
    time: "06:45",
    venueName:
      "Shri Anantapuramu Raghavendra Swamy Kalyana Mandapam and Convention Centre, Banjara Hills",
    address:
      "Plot 1234567890, Extremely-Long-Street-Name-Without-Spaces-Colony-Phase-Three-Extension, Hyderabad, Telangana 500034",
  },
  {
    name: "Reception <b>& Dinner</b>",
    date: "2027-02-15",
    time: "19:00",
    venueName: "Madhapur Convention Hall, Hall 2",
    address: "HITEC City, Madhapur, Hyderabad",
    dressCode: "Grand festive / Black tie optional",
    mapLink: "https://maps.example.com/reception",
  },
];

const GUEST = "D'Souza & Family";

export function sampleEmails(appUrl: string): Record<string, RenderedSample> {
  const base = {
    brideName: "Radha",
    groomName: "Krishna",
    weddingDate: "2027-02-14",
    guestName: GUEST,
    replyBy: "2027-01-20",
    inviteUrl: `${appUrl}/i/${SAMPLE_TOKEN}`,
  };
  return {
    reset: renderPasswordReset({
      name: "Radha Reddy",
      link: `${appUrl}/reset-password?token=${SAMPLE_TOKEN}`,
    }),
    "member-invite": renderMemberInvite({
      name: "Anil Kumar",
      invitedBy: "Radha Reddy",
      weddingName: "Radha & Krishna",
      role: "manager",
      link: `${appUrl}/accept-invite?token=${SAMPLE_TOKEN}`,
    }),
    invitation: renderInvitationEmail({ ...base, kind: "invite", events: SAMPLE_EVENTS }),
    // A reminder lists only what the guest has not answered yet.
    reminder: renderInvitationEmail({
      ...base,
      kind: "reminder",
      events: [SAMPLE_EVENTS[1]!, SAMPLE_EVENTS[2]!],
    }),
  };
}

export const SAMPLE_NAMES = ["reset", "member-invite", "invitation", "reminder"] as const;
