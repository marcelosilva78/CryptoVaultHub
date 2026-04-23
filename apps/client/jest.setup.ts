import '@testing-library/jest-dom';

// Polyfill: ethers v6 expects Uint8Array from crypto, but Node's
// crypto.createHash().digest() returns Buffer. Patch globalThis.crypto
// so sha256 / pbkdf2 produce Uint8Array rather than Buffer.
import { webcrypto } from 'crypto';

Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
});
