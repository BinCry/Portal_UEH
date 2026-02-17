import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export const hashPassword = async (raw: string) => bcrypt.hash(raw, SALT_ROUNDS);
export const verifyPassword = async (raw: string, hash: string) => bcrypt.compare(raw, hash);
