import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Identificadores con prefijo.
 *
 * Un id que dice de qué es (`prop_…`, `dest_…`) ahorra muchísimo tiempo leyendo
 * logs y bitácoras de auditoría.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

export const newUserId = () => newId('user');
export const newProposalId = () => newId('prop');
export const newDestinationId = () => newId('dest');
export const newAuditId = () => newId('aud');
export const newChallengeId = () => newId('chal');
export const newConversationId = () => newId('conv');
export const newMessageId = () => newId('msg');

/** Nonce del reto de login. Debe ser impredecible, no solo único. */
export function newNonce(): string {
  return randomBytes(24).toString('base64url');
}
