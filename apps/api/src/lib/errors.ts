/**
 * Errores de dominio con código estable.
 *
 * El `code` es parte del contrato con el frontend: se puede traducir y se puede
 * probar. El `message` es para humanos y puede cambiar sin romper a nadie.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  unauthorized: (message = 'No has iniciado sesión.') => new AppError('UNAUTHORIZED', message, 401),

  forbidden: (message = 'No tienes permiso para hacer esto.') =>
    new AppError('FORBIDDEN', message, 403),

  notFound: (resource: string) => new AppError('NOT_FOUND', `No se encontró ${resource}.`, 404),

  invalidChallenge: () =>
    new AppError('INVALID_CHALLENGE', 'El reto no existe, ya se usó o caducó.', 400),

  invalidSignature: () =>
    new AppError('INVALID_SIGNATURE', 'La firma no corresponde a esa dirección.', 401),

  invalidTransition: (from: string, to: string) =>
    new AppError(
      'INVALID_TRANSITION',
      `Una propuesta en estado ${from} no puede pasar a ${to}.`,
      409,
    ),

  proposalExpired: () =>
    new AppError('PROPOSAL_EXPIRED', 'La propuesta caducó. Pide una nueva.', 409),

  policyDenied: (reasons: unknown) =>
    new AppError('POLICY_DENIED', 'Tus reglas no permiten esta operación.', 409, reasons),

  confirmationRequired: (message: string) => new AppError('CONFIRMATION_REQUIRED', message, 400),

  signatureRequired: () =>
    new AppError('SIGNATURE_REQUIRED', 'Esta propuesta necesita que la firmes con tu wallet.', 400),

  invalidProposal: (message: string, details?: unknown) =>
    new AppError('INVALID_PROPOSAL', message, 422, details),

  devLoginDisabled: () =>
    new AppError('DEV_LOGIN_DISABLED', 'El login de desarrollo está desactivado.', 403),
};
