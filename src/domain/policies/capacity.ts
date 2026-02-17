export const canUpdateCapacity = ({
  capacityHidden,
  waitingRoomActive,
  userCanOverride,
  overrideRequested,
}: {
  capacityHidden: boolean;
  waitingRoomActive: boolean;
  userCanOverride: boolean;
  overrideRequested: boolean;
}) => {
  if (!capacityHidden) return true;
  if (waitingRoomActive) return true;
  return userCanOverride && overrideRequested;
};
