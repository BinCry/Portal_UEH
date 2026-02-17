type QueueEntry = {
  id: string;
  joinedAt: Date;
};

type PriorityOption = { sectionId: string };
type SectionCapacity = {
  id: string;
  available: number;
  hasConflict?: boolean;
};

export const sortFifo = <T extends QueueEntry>(entries: T[]) =>
  [...entries].sort((a, b) => {
    const time = a.joinedAt.getTime() - b.joinedAt.getTime();
    if (time !== 0) return time;
    return a.id.localeCompare(b.id);
  });

export const chooseSectionByPriority = (priorities: PriorityOption[], sections: SectionCapacity[]) => {
  for (const priority of priorities) {
    const section = sections.find((item) => item.id === priority.sectionId);
    if (!section) continue;
    if (section.available <= 0) continue;
    if (section.hasConflict) continue;
    return section.id;
  }
  return null;
};

export const isOfferExpired = (expiresAt: Date, current = new Date()) =>
  expiresAt.getTime() <= current.getTime();
