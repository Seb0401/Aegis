import { randomBytes } from 'node:crypto';
import type { ResolvedAction, StellarExecutor } from '@aegis/contracts';

/**
 * Ejecutor de mentira para desarrollo y tests.
 *
 * Genera XDR y hashes con formato plausible pero **no toca la red**. Sirve para
 * ejercitar la máquina de estados completa de una propuesta (DRAFT → CONFIRMED)
 * sin depender de testnet ni del signer del agente.
 *
 * Nunca debe usarse con `NODE_ENV=production`: la API lo impide al arrancar.
 */
export class FakeStellarExecutor implements StellarExecutor {
  private readonly submitted = new Map<string, string>();

  async buildUnsigned(accountId: string, actions: ResolvedAction[]): Promise<{ xdr: string }> {
    return { xdr: encode({ kind: 'unsigned', accountId, actions }) };
  }

  async signWithAgent(xdr: string): Promise<{ xdr: string }> {
    return { xdr: encode({ kind: 'agent-signed', inner: xdr }) };
  }

  async submit(xdr: string): Promise<{ hash: string }> {
    const existing = this.submitted.get(xdr);
    if (existing) {
      // Idempotencia: reenviar el mismo XDR no produce un pago nuevo (§12).
      return { hash: existing };
    }

    const hash = randomBytes(32).toString('hex');
    this.submitted.set(xdr, hash);
    return { hash };
  }

  async buildDelegationXdr(accountId: string, agentPublicKey: string): Promise<{ xdr: string }> {
    return { xdr: encode({ kind: 'delegation', accountId, agentPublicKey }) };
  }
}

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}
