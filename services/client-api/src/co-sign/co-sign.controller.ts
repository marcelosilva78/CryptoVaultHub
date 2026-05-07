import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ClientAuth, ClientAuthWithProject, CurrentClientId, ProjectId } from '../common/decorators';
import { CoSignService } from './co-sign.service';

@ApiTags('Co-Sign')
@ApiSecurity('ApiKey')
@Controller('client/v1/co-sign')
export class CoSignController {
  constructor(private readonly coSignService: CoSignService) {}

  @Get('pending')
  @ClientAuthWithProject('read')
  @ApiOperation({
    summary: 'List pending co-sign operations',
    description: `Returns all operations awaiting the client's co-signature. This endpoint is only relevant for clients configured with **co-sign custody mode**, where both the platform and the client must sign transactions before broadcast.

**Co-Sign Custody Mode Overview:**
In co-sign mode, CryptoVaultHub manages one key share and the client manages the other. Withdrawals require signatures from both parties:
1. Client creates a withdrawal request via \`POST /withdrawals\`
2. The platform performs KYT screening and signs with its key share
3. The withdrawal enters \`pending_cosign\` status
4. The client retrieves pending operations via \`GET /co-sign/pending\`
5. The client signs the transaction hash with their key share
6. The client submits their signature via \`POST /co-sign/:operationId/sign\`
7. The platform combines both signatures and broadcasts the transaction

**Operation types:**
- \`withdrawal\` — A withdrawal transaction awaiting co-signature
- \`sweep\` — A sweep transaction from a deposit address to the hot wallet

**Each pending operation includes:**
- \`operationId\` — Unique identifier for referencing this operation
- \`type\` — Operation type (withdrawal or sweep)
- \`txHash\` — The unsigned transaction hash to sign
- \`chain\` / \`chainId\` — The blockchain network
- \`amount\` / \`tokenSymbol\` — Transaction details
- \`createdAt\` — When the operation was created
- \`expiresAt\` — Deadline for submitting the co-signature (typically 24 hours)

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Pending co-sign operations retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              operationId: { type: 'string', example: 'cosign_01HX4N8B2K3M5P7Q9R1S' },
              type: { type: 'string', example: 'withdrawal', enum: ['withdrawal', 'sweep'] },
              txHash: { type: 'string', example: '0xabc123def456...', description: 'Unsigned transaction hash to sign' },
              chainId: { type: 'integer', example: 1 },
              chainName: { type: 'string', example: 'Ethereum' },
              toAddress: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
              amount: { type: 'string', example: '1.5' },
              tokenSymbol: { type: 'string', example: 'ETH' },
              status: { type: 'string', example: 'pending_cosign' },
              relatedId: { type: 'string', example: 'wd_01HX...', description: 'ID of the related withdrawal or sweep' },
              createdAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
              expiresAt: { type: 'string', format: 'date-time', example: '2026-04-10T10:00:00Z', description: 'Signature submission deadline' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope, or client is not in co-sign custody mode.' })
  async listPending(
    @CurrentClientId() clientId: number,
    @ProjectId() projectId: number,
  ) {
    const operations = await this.coSignService.listPending(clientId, projectId);
    return { success: true, operations };
  }

  @Post(':operationId/sign')
  @ClientAuth('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a co-signature',
    description: `Submits the client's co-signature for a pending operation. After successful submission, the platform combines both signatures and proceeds to broadcast the transaction.

**Signing process:**
1. Retrieve the \`txHash\` from the pending operation via \`GET /co-sign/pending\`
2. Sign the transaction hash using your private key share (ECDSA secp256k1)
3. Submit the signature as a hex-encoded string via this endpoint
4. Optionally include the \`publicKey\` for verification (recommended)

**Signature format:**
The signature must be a valid ECDSA signature in hex format (130 characters: r + s + v). The platform verifies the signature against the client's registered public key before proceeding.

**After submission:**
- If valid, the operation status changes to \`signed\` and the transaction is queued for broadcast
- If invalid, the request is rejected with HTTP 422 and the operation remains in \`pending_cosign\`
- If the operation has expired, a 422 error is returned

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'operationId',
    type: String,
    description: 'Unique identifier of the co-sign operation',
    example: 'cosign_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['signature'],
      properties: {
        signature: {
          type: 'string',
          description: 'Hex-encoded ECDSA signature of the transaction hash (130 hex characters: 64 for r, 64 for s, 2 for v)',
          example: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
        },
        publicKey: {
          type: 'string',
          description: 'Optional: The public key corresponding to the signing private key. Used for additional verification. If omitted, the registered public key is used.',
          example: '0x04abc123...',
        },
      },
    },
    examples: {
      basic_signature: {
        summary: 'Submit signature only',
        value: {
          signature: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
        },
      },
      with_public_key: {
        summary: 'Submit signature with public key',
        value: {
          signature: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
          publicKey: '0x04abc123def456789...',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Co-signature submitted and verified successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        operation: {
          type: 'object',
          properties: {
            operationId: { type: 'string', example: 'cosign_01HX4N8B2K3M5P7Q9R1S' },
            status: { type: 'string', example: 'signed', description: 'Updated operation status' },
            relatedId: { type: 'string', example: 'wd_01HX...', description: 'Related withdrawal/sweep ID' },
            message: { type: 'string', example: 'Co-signature accepted. Transaction queued for broadcast.' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid signature format.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope, or client is not in co-sign custody mode.' })
  @ApiResponse({ status: 404, description: 'Operation not found or does not belong to the authenticated client.' })
  @ApiResponse({
    status: 422,
    description: `Signature verification failed. Possible reasons:
- Signature does not match the expected signer
- Operation has expired (past the \`expiresAt\` deadline)
- Operation has already been signed
- Operation was cancelled or rejected`,
  })
  async submitSignature(
    @Param('operationId') operationId: string,
    @Body() body: { signature: string; publicKey?: string },
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.coSignService.submitSignature(
      clientId,
      operationId,
      body,
    );
    return { success: true, ...result };
  }
}
