/**
 * Errores de la API, tipados por código.
 *
 * La API responde siempre con el mismo sobre (`ApiErrorSchema`):
 * `{ error: { code, message, details? } }`. El `code` es estable y es lo que
 * debe decidir el comportamiento de la UI; el `message` ya viene en español y
 * sirve como texto de respaldo.
 */

/** Códigos que la API puede devolver y que la UI trata de forma especial. */
export const API_ERROR_CODES = {
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  invalidChallenge: 'INVALID_CHALLENGE',
  invalidSignature: 'INVALID_SIGNATURE',
  invalidTransition: 'INVALID_TRANSITION',
  /** Riesgo HIGH/CRITICAL: falta que el usuario reescriba el monto total. */
  confirmationRequired: 'CONFIRMATION_REQUIRED',
  /** La propuesta exige firma de la wallet y no se envió `signedXdr`. */
  signatureRequired: 'SIGNATURE_REQUIRED',
  invalidProposal: 'INVALID_PROPOSAL',
  devLoginDisabled: 'DEV_LOGIN_DISABLED',
  rateLimited: 'RATE_LIMITED',
  /** No llegó a haber respuesta: el navegador no pudo conectar. */
  network: 'NETWORK_ERROR',
  /** Hubo respuesta pero no cumple el contrato de `@aegis/contracts`. */
  invalidResponse: 'INVALID_RESPONSE',
} as const;

/** Los códigos conocidos, sin cerrar la puerta a los que añada el backend. */
export type KnownApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
export type ApiErrorCode = string;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  is(code: ApiErrorCode): boolean {
    return this.code === code;
  }
}

/** ¿La sesión dejó de ser válida? Entonces hay que volver a la pantalla de conexión. */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Texto para el usuario.
 *
 * Solo se reescriben los códigos en los que la UI puede decir algo más útil que
 * la API (porque conoce el contexto de la pantalla). En el resto se respeta el
 * mensaje del servidor: está en español y es más específico.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Algo salió mal. Vuelve a intentarlo.';
  }

  switch (error.code) {
    case API_ERROR_CODES.network:
      return 'No se pudo contactar con la API. Comprueba que está levantada y que NEXT_PUBLIC_API_URL apunta a ella.';
    case API_ERROR_CODES.invalidResponse:
      return 'La API respondió algo que no cumple el contrato. Avisa al backend.';
    case API_ERROR_CODES.unauthorized:
      return 'Tu sesión caducó. Vuelve a conectar la wallet.';
    case API_ERROR_CODES.invalidChallenge:
      return 'El reto de firma caducó. Inténtalo otra vez.';
    case API_ERROR_CODES.devLoginDisabled:
      return 'El login de desarrollo está desactivado en la API (ALLOW_DEV_LOGIN).';
    case API_ERROR_CODES.rateLimited:
      return 'Demasiadas peticiones seguidas. Espera unos segundos.';
    default:
      return error.message;
  }
}
