import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;
const MAX_PASSWORD_LENGTH = 72;
const DUMMY_PASSWORD_MATERIAL = "timing-dummy-not-a-credential";

let dummyPasswordHash: string | undefined;

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password length is invalid");
  }

  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}

export async function verifyPasswordOrDummy(password: string, passwordHash: string | null): Promise<boolean> {
  return verifyPassword(password, passwordHash ?? getDummyPasswordHash());
}

function getDummyPasswordHash(): string {
  if (!dummyPasswordHash) {
    dummyPasswordHash = bcrypt.hashSync(DUMMY_PASSWORD_MATERIAL, BCRYPT_ROUNDS);
  }
  return dummyPasswordHash;
}
