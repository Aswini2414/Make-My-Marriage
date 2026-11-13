import { NextResponse } from "next/server";
import type { ZodError } from "zod";

// Every error code from docs/api-design.md, with its HTTP status.
export const ERROR_STATUS = {
  // General
  VALIDATION_FAILED: 400,
  NOT_AUTHENTICATED: 401,
  NO_WORKSPACE: 403,
  FORBIDDEN: 403,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  // Auth and members
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  TOKEN_INVALID: 400,
  ALREADY_IN_WORKSPACE: 409,
  ALREADY_MEMBER: 409,
  IN_OTHER_WORKSPACE: 409,
  LAST_ADMIN: 409,
  CREATOR_PROTECTED: 403,
  // Wedding and events
  SLUG_TAKEN: 409,
  SLUG_RESERVED: 400,
  UNKNOWN_EVENT_TYPE: 400,
  TYPE_EXISTS: 409,
  TOO_MANY_TYPES: 400,
  // Guests and invitations
  GUEST_EMAIL_EXISTS: 409,
  IMPORT_FILE_INVALID: 400,
  SEND_IN_PROGRESS: 409,
  SEND_BUSY: 409,
  EMAIL_CAP_REACHED: 429,
  // Money, vendors and tasks
  UNKNOWN_CATEGORY: 400,
  GIFT_EMPTY: 400,
  SHARE_NEEDS_CONTACT: 400,
  VENDOR_ALREADY_ADDED: 409,
  ASSIGNEE_NOT_MEMBER: 400,
  NOT_ASSIGNEE: 403,
  // Files, photos and QR codes
  FILE_TOO_LARGE: 413,
  FILE_TYPE_NOT_ALLOWED: 400,
  STORAGE_FULL: 409,
  QR_EXISTS_FOR_EVENT: 409,
  UPLOADS_OFF: 403,
  // Guest-facing
  LINK_NOT_FOUND: 404,
  WEDDING_NOT_FOUND: 404,
  GALLERY_OFF: 404,
  EVENT_NOT_INVITED: 400,
  RSVP_CLOSED: 403,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: "Some fields need fixing.",
  NOT_AUTHENTICATED: "Please log in to continue.",
  NO_WORKSPACE: "You're not part of a wedding workspace yet.",
  FORBIDDEN: "You don't have permission to do that.",
  FORBIDDEN_ORIGIN: "This request isn't allowed.",
  NOT_FOUND: "We couldn't find that.",
  RATE_LIMITED: "Too many attempts. Try again later.",
  SERVER_ERROR: "Something went wrong. Please try again.",
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  TOKEN_INVALID: "This link is invalid or has expired.",
  LINK_NOT_FOUND: "This link isn't valid.",
  RSVP_CLOSED: "Replies are closed. Please contact the couple.",
  EVENT_NOT_INVITED: "You are not invited to one of those events.",
  SEND_IN_PROGRESS: "A send is already in progress or paused. Finish or cancel it first.",
  SEND_BUSY: "Another batch is sending. Please wait a moment.",
  EMAIL_CAP_REACHED: "We've reached today's email limit. Please try again tomorrow.",
  ALREADY_MEMBER: "This person is already a member.",
  ALREADY_IN_WORKSPACE: "You're already part of a wedding workspace.",
  IN_OTHER_WORKSPACE: "This email already belongs to another wedding workspace.",
  LAST_ADMIN: "A wedding needs at least one Admin. Make someone else an Admin first.",
  CREATOR_PROTECTED: "The person who created the wedding can't be removed.",
  SLUG_TAKEN: "That address is already used by another wedding.",
  SLUG_RESERVED: "That address is reserved. Try another.",
  UNKNOWN_EVENT_TYPE: "Choose one of the listed event types.",
  TYPE_EXISTS: "That event type already exists.",
  TOO_MANY_TYPES: "You can add up to 30 custom event types.",
  ASSIGNEE_NOT_MEMBER: "Choose someone who is part of this wedding.",
  NOT_ASSIGNEE: "Only the assignee or an Admin can do that.",
  IMPORT_FILE_INVALID: "We couldn't read that file. Use the template and save it as .csv or .xlsx.",
  FILE_TOO_LARGE: "That file is too large.",
  FILE_TYPE_NOT_ALLOWED: "Upload a .csv or .xlsx file.",
};

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    message?: string,
    options: { fields?: FieldErrors; retryAfterSeconds?: number } = {},
  ) {
    super(message ?? DEFAULT_MESSAGES[code] ?? code);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.fields = options.fields;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** The one error shape: { error: { code, message, fields? } }. */
export function errorResponse(err: ApiError): NextResponse {
  const body = {
    error: {
      code: err.code,
      message: err.message,
      ...(err.fields && err.status === 400 ? { fields: err.fields } : {}),
    },
  };
  const headers: HeadersInit = {};
  if (err.retryAfterSeconds !== undefined) headers["Retry-After"] = String(err.retryAfterSeconds);
  return NextResponse.json(body, { status: err.status, headers });
}

/** Turns Zod issues into { field: message }, keeping the first message per field. */
export function zodToFields(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    fields[key] ??= issue.message;
  }
  return fields;
}
