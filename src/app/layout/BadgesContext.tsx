import { createContext, useContext } from "react";

export type Badges = {
  repliesUnread: number;
  repliesTotal: number;
  emailUnread: number;
  emailTotal: number;
  prospectsNew: number;
  outreachDrafts: number;
};

export type BadgesContextValue = Badges & {
  setReplyCounts: (counts: { unread: number; total: number }) => void;
  setEmailCounts: (counts: { unread: number; total: number }) => void;
  refresh: () => void;
};

export const EMPTY_BADGES: Badges = {
  repliesUnread: 0,
  repliesTotal: 0,
  emailUnread: 0,
  emailTotal: 0,
  prospectsNew: 0,
  outreachDrafts: 0,
};

const BadgesContext = createContext<BadgesContextValue>({
  ...EMPTY_BADGES,
  setReplyCounts: () => {},
  setEmailCounts: () => {},
  refresh: () => {},
});

export const BadgesProvider = BadgesContext.Provider;

export function useBadges() {
  return useContext(BadgesContext);
}
