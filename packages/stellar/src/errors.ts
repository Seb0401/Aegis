import { BadRequestError, NetworkError, NotFoundError } from '@stellar/stellar-sdk';

export type StellarClientErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'INVALID_TRANSACTION'
  | 'UNSUPPORTED_ASSET'
  | 'TX_REJECTED'
  | 'NETWORK_UNAVAILABLE'
  | 'TX_STATUS_UNKNOWN';

/** Error estable y seguro para los consumidores de @aegis/stellar. */
export class StellarClientError extends Error {
  constructor(
    public readonly code: StellarClientErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'StellarClientError';
  }
}

export function mapHorizonError(
  error: unknown,
  operation: 'read' | 'build' | 'submit',
): StellarClientError {
  if (error instanceof StellarClientError) return error;

  // Horizon puede cruzar límites ESM/CJS con otra copia de la clase de error.
  // El status es más estable que `instanceof` y no expone el body (que puede
  // contener el envelope firmado).
  const status = responseStatus(error);
  if (operation === 'submit' && status === 400) {
    return new StellarClientError('TX_REJECTED', 'Stellar rechazó la transacción.');
  }
  if (operation === 'submit' && status === 504) {
    return new StellarClientError(
      'TX_STATUS_UNKNOWN',
      'Horizon agotó el tiempo de espera; hay que consultar el hash antes de reenviar.',
      true,
    );
  }

  if (error instanceof NotFoundError) {
    return new StellarClientError('ACCOUNT_NOT_FOUND', 'La cuenta no existe en Stellar.');
  }

  if (error instanceof BadRequestError) {
    return new StellarClientError(
      operation === 'submit' ? 'TX_REJECTED' : 'INVALID_TRANSACTION',
      operation === 'submit'
        ? 'Stellar rechazó la transacción.'
        : 'No se pudo construir una transacción válida.',
      false,
    );
  }

  if (error instanceof NetworkError) {
    if (operation === 'submit' && error.response.status === 504) {
      return new StellarClientError(
        'TX_STATUS_UNKNOWN',
        'Horizon agotó el tiempo de espera; hay que consultar el hash antes de reenviar.',
        true,
      );
    }

    return new StellarClientError('NETWORK_UNAVAILABLE', 'No se pudo contactar con Horizon.', true);
  }

  return new StellarClientError(
    operation === 'submit' ? 'TX_STATUS_UNKNOWN' : 'NETWORK_UNAVAILABLE',
    operation === 'submit'
      ? 'No se pudo determinar el estado de la transacción.'
      : 'Falló la comunicación con Stellar.',
    true,
  );
}

function responseStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
  const response = error.response;
  if (!response || typeof response !== 'object' || !('status' in response)) return undefined;
  return typeof response.status === 'number' ? response.status : undefined;
}
