import type { Metadata } from "next";
import { NoticeCard } from "@/components/invitation/NoticeCard";

// Shown (with HTTP 404) for an unknown, malformed or replaced link. All three look the same, so
// the page never says whether a link ever existed.
export const metadata: Metadata = {
  title: "Link not valid",
  robots: { index: false, follow: false },
};

export default function InviteNotFound() {
  return (
    <NoticeCard plain="This link is" italic="not valid">
      Please check the link in your invitation email, or contact the family.
    </NoticeCard>
  );
}
