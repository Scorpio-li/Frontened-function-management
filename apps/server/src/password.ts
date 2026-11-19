import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

function scryptAsync(plain: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    scrypt(plain, salt, keyLength, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise(derivedKey);
    });
  });
}

/** 生成 `saltHex:hashHex` 形式的密码哈希，盐为 16 字节随机值。 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scryptAsync(plain, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/** 校验密码；存储格式异常时返回 false，比较使用 timingSafeEqual。 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length === 0 || expected.length === 0) return false;

  const derivedKey = await scryptAsync(plain, salt, expected.length);
  return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
}
