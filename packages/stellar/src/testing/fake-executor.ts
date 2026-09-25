import { createHash } from 'node:crypto';
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
/** Clave pública del "agente" de mentira. Es válida, pero nadie tiene su seed. */
export const FAKE_AGENT_PUBLIC_KEY = 'GBH5AQXXYIHEUMGEHOQZTPM7P3JOQFVEGQU3TUX6PVSXL5SBIVGYF4DO';

export class FakeStellarExecutor implements StellarExecutor {
  /** Dirección fija y válida: los tests necesitan que sea estable. */
  getAgentPublicKey(): string {
    return FAKE_AGENT_PUBLIC_KEY;
  }

  async buildUnsigned(accountId: string, actions: ResolvedAction[]): Promise<{ xdr: string }> {
    return { xdr: encode({ kind: 'unsigned', accountId, actions }) };
  }

  async signWithAgent(xdr: string): Promise<{ xdr: string }> {
    return { xdr: encode({ kind: 'agent-signed', inner: xdr }) };
  }

  /**
   * En Stellar el hash sale del contenido firmado, no del envío. Aquí se imita
   * con un sha256 del XDR: lo que importa no es el valor sino que sea el mismo
   * antes y después de enviar, que es de lo que depende la reconciliación.
   */
  hashOf(signedXdr: string): string {
    return createHash('sha256').update(signedXdr).digest('hex');
  }

  async submit(xdr: string): Promise<{ hash: string }> {
    // Idempotencia: reenviar el mismo XDR no produce un pago nuevo (§12), y
    // por eso mismo devuelve el mismo hash.
    return { hash: this.hashOf(xdr) };
  }

  async buildDelegationXdr(accountId: string, agentPublicKey: string): Promise<{ xdr: string }> {
    return { xdr: encode({ kind: 'delegation', accountId, agentPublicKey }) };
  }
}

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}
