import { verifyChallengeSignature } from '@aegis/stellar';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { authChallenges, users } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import { newChallengeId, newNonce, newUserId } from '../lib/ids.js';

export interface AuthUser {
  id: string;
  address: string;
}

/**
 * Login firmando un reto con la wallet (BE2-02, Q-07).
 *
 * El flujo es el clásico de Web3 y evita contraseñas por completo:
 *
 *   1. El cliente pide un reto para su dirección.
 *   2. Firma el texto del reto con Freighter.
 *   3. Devuelve la firma; si verifica, recibe un JWT de sesión.
 *
 * El reto incluye un nonce aleatorio, caduca y se consume una sola vez, así que
 * una firma capturada no sirve para volver a entrar.
 */
export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly challengeTtlSeconds: number,
  ) {}

  async createChallenge(address: string): Promise<{
    challengeId: string;
    challenge: string;
    expiresAt: Date;
  }> {
    const id = newChallengeId();
    const expiresAt = new Date(Date.now() + this.challengeTtlSeconds * 1000);

    const challenge = [
      'Aegis quiere verificar que esta wallet es tuya.',
      '',
      `Dirección: ${address}`,
      `Código: ${newNonce()}`,
      `Caduca: ${expiresAt.toISOString()}`,
      '',
      'Firmar este mensaje no mueve fondos ni autoriza ningún pago.',
    ].join('\n');

    await this.db.insert(authChallenges).values({ id, address, challenge, expiresAt });

    return { challengeId: id, challenge, expiresAt };
  }

  async verify(challengeId: string, signature: string): Promise<AuthUser> {
    const [challenge] = await this.db
      .select()
      .from(authChallenges)
      .where(and(eq(authChallenges.id, challengeId), isNull(authChallenges.consumedAt)))
      .limit(1);

    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      throw errors.invalidChallenge();
    }

    // El reto se consume antes de verificar la firma: así, un atacante que
    // pruebe firmas a ciegas gasta un reto por intento en vez de poder repetir.
    const consumed = await this.db
      .update(authChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(authChallenges.id, challengeId), isNull(authChallenges.consumedAt)))
      .returning({ id: authChallenges.id });

    if (consumed.length === 0) {
      throw errors.invalidChallenge();
    }

    if (!verifyChallengeSignature(challenge.address, challenge.challenge, signature)) {
      throw errors.invalidSignature();
    }

    return this.findOrCreateUser(challenge.address);
  }

  async findOrCreateUser(address: string): Promise<AuthUser> {
    const [existing] = await this.db
      .select({ id: users.id, address: users.address })
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    if (existing) return existing;

    const [created] = await this.db
      .insert(users)
      .values({ id: newUserId(), address })
      .onConflictDoNothing({ target: users.address })
      .returning({ id: users.id, address: users.address });

    if (created) return created;

    // Otro proceso creó el usuario entre el SELECT y el INSERT.
    const [race] = await this.db
      .select({ id: users.id, address: users.address })
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    if (!race) throw errors.notFound('el usuario');
    return race;
  }
}
