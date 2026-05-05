import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import * as secp256k1 from 'secp256k1';
import { PrismaService } from '../prisma/prisma.service';
import { KeyGenerationService } from '../key-generation/key-generation.service';
import { AuditService } from '../audit/audit.service';

export interface SignatureResult {
  signature: string;
  v: number;
  r: string;
  s: string;
  address: string;
}

export interface SignTransactionResult {
  signedTransaction: string;
  txHash: string;
  from: string;
}

/**
 * Maximum allowed value for `s` in an Ethereum signature (low-S normalization).
 * Signatures with s > secp256k1n/2 are malleable — the EVM's ecrecover accepts
 * both (r, s) and (r, secp256k1n - s), which lets an attacker flip `s` without
 * invalidating the signature. EIP-2 and most contracts reject high-S values.
 *
 * secp256k1n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
 * MAX_S = secp256k1n / 2
 */
const SECP256K1_N = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);
const SECP256K1_N_HALF = SECP256K1_N / 2n;

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyGenService: KeyGenerationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sign a 32-byte message hash using native secp256k1 ECDSA.
   *
   * SECURITY: The private key remains as a Buffer/Uint8Array throughout and is
   * NEVER converted to a JavaScript string. JS strings are immutable and interned
   * in V8's heap — they cannot be zeroed after use. By keeping the key as a Buffer
   * we can reliably wipe it from memory in the caller's `finally` block.
   *
   * Only the resulting *signature* (which is not secret) is converted to hex strings.
   */
  private signMessageHash(
    msgHash: Buffer,
    privateKey: Buffer,
  ): { r: string; s: string; v: number; serialized: string } {
    const { signature, recid } = secp256k1.ecdsaSign(
      Uint8Array.from(msgHash),
      Uint8Array.from(privateKey),
    );

    const r: Buffer = Buffer.from(signature.slice(0, 32));
    let s: Buffer = Buffer.from(signature.slice(32, 64));
    let v = recid + 27; // Ethereum recovery ID: 27 or 28

    // Low-S normalization (EIP-2 / BIP-62 malleability protection).
    // If s > secp256k1n/2, replace s with secp256k1n - s and flip v.
    const sBigInt = BigInt('0x' + s.toString('hex'));
    if (sBigInt > SECP256K1_N_HALF) {
      const sNormalized = SECP256K1_N - sBigInt;
      const normalizedHex = sNormalized.toString(16).padStart(64, '0');
      s = Buffer.from(normalizedHex, 'hex');
      v = v === 27 ? 28 : 27;
    }

    const rHex = r.toString('hex').padStart(64, '0');
    const sHex = s.toString('hex').padStart(64, '0');
    const vHex = v.toString(16).padStart(2, '0');

    return {
      r: '0x' + rHex,
      s: '0x' + sHex,
      v,
      serialized: '0x' + rHex + sHex + vHex,
    };
  }

  /**
   * Sign a hash with the specified key type for a client.
   * The private key is decrypted in memory, used for signing, then zeroed.
   */
  async signHash(
    clientId: number,
    hash: string,
    keyType: string,
    requestedBy: string,
  ): Promise<SignatureResult> {
    const { privateKey, address, keyId } =
      await this.keyGenService.decryptPrivateKey(clientId, keyType);

    try {
      // Convert hash to Buffer — privateKey is ALREADY a Buffer, no string conversion needed
      const msgHashBytes = Buffer.from(
        hash.startsWith('0x') ? hash.slice(2) : hash,
        'hex',
      );

      const sig = this.signMessageHash(msgHashBytes, privateKey);

      // Update usage stats
      await this.prisma.derivedKey.update({
        where: { id: keyId },
        data: {
          lastUsedAt: new Date(),
          signCount: { increment: 1 },
        },
      });

      await this.audit.log({
        operation: 'sign_hash',
        clientId,
        keyType,
        address,
        txHash: hash,
        requestedBy,
      });

      return {
        signature: sig.serialized,
        v: sig.v,
        r: sig.r,
        s: sig.s,
        address,
      };
    } finally {
      // CRITICAL: zero private key from memory — this is effective because
      // privateKey is a Buffer (backed by ArrayBuffer), NOT a JS string.
      privateKey.fill(0);
    }
  }

  /**
   * Sign a full transaction with the specified key type for a client and chain.
   * Used for on-chain operations like sweep/flush where we need a signed raw tx.
   *
   * SECURITY: The private key is NEVER converted to a JavaScript string. We build
   * the unsigned transaction using ethers.Transaction (no private key needed), then
   * sign the unsigned hash with native secp256k1 using the Buffer-based private key,
   * and finally attach the signature to the Transaction object for RLP serialization.
   */
  async signTransaction(
    clientId: number,
    chainId: number,
    keyType: string,
    txData: {
      to?: string | null;
      data: string;
      value?: string;
      gasLimit: string;
      gasPrice?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      nonce: number;
      chainId: number;
    },
    requestedBy: string,
  ): Promise<SignTransactionResult> {
    const { privateKey, address, keyId } =
      await this.keyGenService.decryptPrivateKeyForChain(
        clientId,
        keyType,
        chainId,
      );

    try {
      // Build an unsigned Transaction object — no private key involved here
      const tx = ethers.Transaction.from({
        to: txData.to,
        data: txData.data,
        value: txData.value ?? '0',
        gasLimit: BigInt(txData.gasLimit),
        nonce: txData.nonce,
        chainId: txData.chainId,
        ...(txData.maxFeePerGas
          ? {
              maxFeePerGas: BigInt(txData.maxFeePerGas),
              maxPriorityFeePerGas: BigInt(
                txData.maxPriorityFeePerGas ?? '0',
              ),
              type: 2,
            }
          : txData.gasPrice
            ? {
                gasPrice: BigInt(txData.gasPrice),
                type: 0,
              }
            : {}),
      });

      // Get the unsigned transaction hash — this is just keccak256 of the
      // RLP-encoded unsigned transaction, no private key involved.
      const unsignedHash = tx.unsignedHash;
      const msgHashBytes = Buffer.from(unsignedHash.slice(2), 'hex');

      // Sign using native secp256k1 — private key stays as Buffer
      const sig = this.signMessageHash(msgHashBytes, privateKey);

      // Attach the signature to the Transaction object so ethers can produce
      // the correctly RLP-encoded signed transaction.
      tx.signature = ethers.Signature.from({
        r: sig.r,
        s: sig.s,
        v: sig.v,
      });

      const signedTx = tx.serialized;
      const txHash = tx.hash!;

      // Update usage stats
      await this.prisma.derivedKey.update({
        where: { id: keyId },
        data: {
          lastUsedAt: new Date(),
          signCount: { increment: 1 },
        },
      });

      await this.audit.log({
        operation: 'sign_transaction',
        clientId,
        keyType,
        address,
        txHash,
        chainId,
        requestedBy,
        metadata: {
          to: txData.to,
          nonce: txData.nonce,
          gasLimit: txData.gasLimit,
        },
      });

      return {
        signedTransaction: signedTx,
        txHash,
        from: address,
      };
    } finally {
      // CRITICAL: zero private key from memory — this is effective because
      // privateKey is a Buffer (backed by ArrayBuffer), NOT a JS string.
      privateKey.fill(0);
    }
  }

  /**
   * Sign multiple hashes with the same key (batch signing).
   * Key is decrypted once and used for all hashes, then zeroed.
   */
  async signBatch(
    clientId: number,
    hashes: string[],
    keyType: string,
    requestedBy: string,
  ): Promise<SignatureResult[]> {
    const { privateKey, address, keyId } =
      await this.keyGenService.decryptPrivateKey(clientId, keyType);

    try {
      const results: SignatureResult[] = [];

      for (const hash of hashes) {
        const msgHashBytes = Buffer.from(
          hash.startsWith('0x') ? hash.slice(2) : hash,
          'hex',
        );

        const sig = this.signMessageHash(msgHashBytes, privateKey);

        results.push({
          signature: sig.serialized,
          v: sig.v,
          r: sig.r,
          s: sig.s,
          address,
        });
      }

      // Update usage stats
      await this.prisma.derivedKey.update({
        where: { id: keyId },
        data: {
          lastUsedAt: new Date(),
          signCount: { increment: hashes.length },
        },
      });

      await this.audit.log({
        operation: 'sign_batch',
        clientId,
        keyType,
        address,
        requestedBy,
        metadata: { hashCount: hashes.length },
      });

      return results;
    } finally {
      // CRITICAL: zero private key from memory — this is effective because
      // privateKey is a Buffer (backed by ArrayBuffer), NOT a JS string.
      privateKey.fill(0);
    }
  }
}
