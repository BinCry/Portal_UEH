import { NextResponse } from "next/server";

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: ApiError;
};

export const ok = <T>(data: T, init?: ResponseInit) =>
  NextResponse.json<ApiResponse<T>>({ success: true, data }, init);

export const fail = (error: ApiError, status = 400) =>
  NextResponse.json<ApiResponse<never>>({ success: false, error }, { status });
