// The shapes the guest routes answer with. Browser-safe, so the Guests page (3B) and the
// server cannot drift apart.

export type InviteStatus = "not_sent" | "sent" | "opened";

export type GuestItem = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  relation?: string;
  household?: string;
  eventIds: string[];
  /** Worked out on read from lastInviteSentAt and inviteOpenedAt. */
  inviteStatus: InviteStatus;
  lastInviteSentAt?: string;
  inviteOpenedAt?: string;
  /** How many of the guest's events have an answer. Always 0 replied until Phase 4. */
  rsvp: { replied: number; of: number };
  /** Another guest in this wedding has the same email or phone. Set on list rows only. */
  duplicate?: true;
};

/** The numbers above the Guests list. They always count the whole wedding, never the filters. */
export type GuestSummary = {
  total: number;
  /** Different household names in use. */
  households: number;
  /** Guests invited to at least one event. */
  invited: number;
  /** Guests with no event yet. */
  unassigned: number;
};

export type GuestList = { items: GuestItem[]; nextCursor?: string; total: number };

export type DuplicateMatch = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  matchedOn: ("email" | "phone")[];
};

/** Create and update answer with this (200) when a duplicate needs the member's say-so. */
export type DuplicateWarning = { saved: false; duplicates: DuplicateMatch[] };

export type HouseholdItem = { name: string; count: number };

export type ImportRowDuplicate =
  { kind: "existing"; guestId: string; name: string } | { kind: "file"; row: number };

export type ImportRow = {
  /** The spreadsheet row number (the header is row 1). */
  row: number;
  data: {
    name?: string;
    email?: string;
    phone?: string;
    relation?: string;
    household?: string;
    /** The event names as typed. */
    events?: string;
    /** The resolved events, ready for the commit step. */
    eventIds?: string[];
  };
  errors: Record<string, string>;
  duplicate?: ImportRowDuplicate;
};

export type ImportPreview = {
  rows: ImportRow[];
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
};

export type ImportResult = { created: number; skipped: number; invalid: number };
