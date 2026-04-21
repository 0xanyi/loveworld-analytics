import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface KekProvider {
  currentVersion: string;
  getKey(version: string): Buffer;
}

export type SealedCredentials = {
  ciphertext: string;
  kekVersion: string;
};

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

  const layout = Buffer.concat([
    Uint8Array.of(dekIv.length),
    dekIv,
    Uint8Array.of(wrappedDek.length),
    wrappedDek,
    Uint8Array.of(dekTag.length),
    dekTag,
    Uint8Array.of(ctIv.length),
    ctIv,
    ct,
    ctTag,
  ]);

  return { ciphertext: layout.toString("base64"), kekVersion: kek.currentVersion };
}

export async function openCredentials<T>(sealed: SealedCredentials, kek: KekProvider): Promise<T> {
  const kekKey = kek.getKey(sealed.kekVersion);
  const buf = Buffer.from(sealed.ciphertext, "base64");
  let p = 0;
  const read = (n: number) => {
    const s = buf.subarray(p, p + n);
    p += n;
    return s;
  };

  const dekIvLen = buf[p++]!;
  const dekIv = read(dekIvLen);
  const wrappedDekLen = buf[p++]!;
  const wrappedDek = read(wrappedDekLen);
  const dekTagLen = buf[p++]!;
  const dekTag = read(dekTagLen);
  const ctIvLen = buf[p++]!;
  const ctIv = read(ctIvLen);
  const ctTagLen = 16;
  const ct = buf.subarray(p, buf.length - ctTagLen);
  const ctTag = buf.subarray(buf.length - ctTagLen);

  const dekDecipher = createDecipheriv("aes-256-gcm", kekKey, dekIv);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDecipher.update(wrappedDek), dekDecipher.final()]);

  const ctDecipher = createDecipheriv("aes-256-gcm", dek, ctIv);
  ctDecipher.setAuthTag(ctTag);
  const plain = Buffer.concat([ctDecipher.update(ct), ctDecipher.final()]);

  return JSON.parse(plain.toString("utf8")) as T;
}
