import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { requireMember, requireUser } from "@/lib/access";
import { ApiError } from "@/lib/errors";
import { Membership } from "@/modules/members/model";
import { createMember, createUser, emptyDb, request, resetDb } from "../helpers";

beforeAll(resetDb);
beforeEach(emptyDb);
afterAll(() => mongoose.disconnect());

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "ok";
  } catch (err) {
    if (err instanceof ApiError) return err.code;
    throw err;
  }
};

describe("requireUser", () => {
  it("answers NOT_AUTHENTICATED with no session, and for a user that doesn't exist", async () => {
    expect(await codeOf(requireUser(await request("/x")))).toBe("NOT_AUTHENTICATED");
    const ghost = new Types.ObjectId().toHexString();
    expect(await codeOf(requireUser(await request("/x", { userId: ghost })))).toBe(
      "NOT_AUTHENTICATED",
    );
  });

  it("returns the user, without the password hash", async () => {
    const user = await createUser();
    const { user: found } = await requireUser(await request("/x", { userId: String(user._id) }));
    expect(found).toEqual({ id: String(user._id), name: "Leela", email: "leela@example.com" });
  });
});

describe("requireMember", () => {
  it("answers NOT_AUTHENTICATED with no session", async () => {
    expect(await codeOf(requireMember(await request("/x")))).toBe("NOT_AUTHENTICATED");
  });

  it("answers NO_WORKSPACE for a user with no active membership", async () => {
    const user = await createUser();
    expect(await codeOf(requireMember(await request("/x", { userId: String(user._id) })))).toBe(
      "NO_WORKSPACE",
    );
  });

  it("takes the wedding from the membership, never from the request", async () => {
    const a = await createMember("admin");
    await createMember("admin"); // another wedding
    const { membership } = await requireMember(
      await request(`/x?weddingId=${new Types.ObjectId().toHexString()}`, {
        userId: String(a.user._id),
      }),
    );
    expect(membership.weddingId).toBe(String(a.weddingId));
    expect(membership.role).toBe("admin");
  });

  it("lets a Manager through Member routes but answers FORBIDDEN on Admin routes", async () => {
    const { user } = await createMember("manager");
    const req = () => request("/x", { userId: String(user._id) });
    expect(await codeOf(requireMember(await req()))).toBe("ok");
    expect(await codeOf(requireMember(await req(), "admin"))).toBe("FORBIDDEN");
  });

  it("lets an Admin through Admin routes", async () => {
    const { user } = await createMember("admin");
    expect(
      await codeOf(requireMember(await request("/x", { userId: String(user._id) }), "admin")),
    ).toBe("ok");
  });

  it("loses access the moment a member is removed", async () => {
    const { user } = await createMember("manager");
    await Membership.updateOne({ userId: user._id }, { status: "removed" });
    expect(await codeOf(requireMember(await request("/x", { userId: String(user._id) })))).toBe(
      "NO_WORKSPACE",
    );
  });
});
