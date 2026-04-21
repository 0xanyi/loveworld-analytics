import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface KekProvider {
  currentVersion: string;
  getKey(version: string): Buffer;
}

export type SealedCredentials = {
  ciphertext: string;
  kekVersion: string;
};

const ENVELOPE_VERSION = 1;
const GCM_TAG_LENGTH = 16;

export async function sealCredentials<T>(plain: T, kek: KekProvider): Promise<SealedCredentials> {
  const dek = randomBytes(32);
  const kekKey = kek.getKey(kek.currentVersion);

  const dekIv = randomBytes(12);
  const dekCipher = createCipheriv("aes-256-gcm", kekKey, dekIv);
  const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  const ctIv = randomBytes(12);
  const ctCipher = createCipheriv("aes-256-gcm", dek, ctIv);
  const ct = Buffer.concat([ctCipher.update(Buffer.from(JSON.stringify(plain))), ctCipher.final()]);
  const ctTag = ctCipher.getAuthTag();

  const ctLength = Buffer.allocUnsafe(4);
  ctLength.writeUInt32BE(ct.length, 0);

  const layout = Buffer.concat([
    Uint8Array.of(ENVELOPE_VERSION),
    Uint8Array.of(dekIv.length),
    dekIv,
    Uint8Array.of(wrappedDek.length),
    wrappedDek,
    Uint8Array.of(dekTag.length),
    dekTag,
    Uint8Array.of(ctIv.length),
    ctIv,
    ctLength,
    ct,
    ctTag,
  ]);

  return { ciphertext: layout.toString("base64"), kekVersion: kek.currentVersion };
}

export async function openCredentials<T>(sealed: SealedCredentials, kek: KekProvider): Promise<T> {
  const kekKey = kek.getKey(sealed.kekVersion);
  const buf = Buffer.from(sealed.ciphertext, "base64");
  let p = 0;

  const failFormat = () => {
    throw new Error("invalid sealed credentials format");
  };

  const readByte = () => {
    if (p >= buf.length) failFormat();
    const value = buf[p]!;
    p += 1;
    return value;
  };

  const read = (n: number) => {
    if (n < 0 || p + n > buf.length) failFormat();
    const value = buf.subarray(p, p + n);
    p += n;
    return value;
  };

  if (buf.length < 1 + 4 + GCM_TAG_LENGTH) failFormat();

  const version = readByte();
  if (version !== ENVELOPE_VERSION) failFormat();

  const dekIvLen = readByte();
  const dekIv = read(dekIvLen);

  const wrappedDekLen = readByte();
  const wrappedDek = read(wrappedDekLen);

  const dekTagLen = readByte();
  const dekTag = read(dekTagLen);

  const ctIvLen = readByte();
  const ctIv = read(ctIvLen);

  const ctLenBuf = read(4);
  const ctLen = ctLenBuf.readUInt32BE(0);
  const ct = read(ctLen);

  const ctTag = read(GCM_TAG_LENGTH);

  if (p !== buf.length) failFormat();

  const dekDecipher = createDecipheriv("aes-256-gcm", kekKey, dekIv);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDecipher.update(wrappedDek), dekDecipher.final()]);

  const ctDecipher = createDecipheriv("aes-256-gcm", dek, ctIv);
  ctDecipher.setAuthTag(ctTag);
  const plain = Buffer.concat([ctDecipher.update(ct), ctDecipher.final()]);

  return JSON.parse(plain.toString("utf8")) as T;
}
