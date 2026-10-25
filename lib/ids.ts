import { isValidObjectId, Types } from "mongoose";
import { ApiError } from "@/lib/errors";

/**
 * Converts a 24-character hex ID to an ObjectId. Needed in every aggregate() $match,
 * because Mongoose only casts IDs in find(). An invalid ID answers 404, the same as a
 * missing record.
 */
export function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  if (!/^[0-9a-f]{24}$/i.test(id) || !isValidObjectId(id)) throw new ApiError("NOT_FOUND");
  return new Types.ObjectId(id);
}
