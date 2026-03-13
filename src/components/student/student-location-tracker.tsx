"use client";

import { useEffect } from "react";

const saveStudentLocation = async (position: GeolocationPosition) => {
  try {
    await fetch("/api/location/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
      }),
    });
  } catch (error) {
    console.warn("Unable to save student location", error);
  }
};

export const StudentLocationTracker = () => {
  useEffect(() => {
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void saveStudentLocation(position);
      },
      (error) => {
        console.warn("Student geolocation was not captured", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }, []);

  return null;
};
