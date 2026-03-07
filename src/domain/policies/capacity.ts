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

export const validateSeatCounters = ({
  capacity,
  registeredCount,
  reservedCount,
  enrolledCount,
}: {
  capacity: number;
  registeredCount: number;
  reservedCount: number;
  enrolledCount: number;
}) => {
  if (registeredCount < 0) {
    return "Sĩ số đã đăng ký không được âm";
  }

  if (registeredCount < enrolledCount) {
    return "Sĩ số đã đăng ký không được nhỏ hơn số sinh viên ENROLLED thực tế";
  }

  if (capacity < registeredCount + reservedCount) {
    return "Sĩ số tối đa phải lớn hơn hoặc bằng tổng đã đăng ký + đã giữ chỗ";
  }

  return null;
};
