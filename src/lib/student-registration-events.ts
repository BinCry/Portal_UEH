export const STUDENT_REGISTRATION_UPDATED_EVENT = "ueh:student-registration-updated";

export const emitStudentRegistrationUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STUDENT_REGISTRATION_UPDATED_EVENT));
};
