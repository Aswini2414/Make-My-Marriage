import "server-only";

// Registers every Mongoose model, so scripts like db:indexes see all of them.
// Add one import here for each new modules/<module>/model.ts.

import "@/lib/rate-limit";
import "@/modules/auth/model";
import "@/modules/events/model";
import "@/modules/members/model";
import "@/modules/qr/model";
import "@/modules/tasks/model";
import "@/modules/weddings/model";
