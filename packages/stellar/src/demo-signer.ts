import { Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { loadStellarM1Config } from './config.js';
import { StellarClientError } from './errors.js';
import { validateAddress } from './horizon-account-client.js';

/**
 * Custodia y rotación de la clave del signer (BE1-10).
 *
 * La seed del agente vive en una variable de entorno del gestor de secretos del
 * proveedor. Eso tiene un límite que conviene decir en voz alta: quien pueda
 * leer el entorno del proceso puede firmar como el agente. El razonamiento
 * completo, y por qué no KMS por ahora, está en el ADR 0013.
 *
 * Lo que sí se puede hacer, y es lo que hay aquí, es que **rotarla sea fácil**.
 * Una clave que no se puede cambiar sin dolor es una clave que nadie cambia.
 *
 *   pnpm --filter @aegis/stellar demo:signer verify   → ¿el signer está donde creemos?
 *   pnpm --filter @aegis/stellar demo:signer rotate   → XDR para cambiarlo
 *
 * Solo testnet.
 */

/** Peso del signer del agente. Bajo a propósito: ver §4.4 del PLAN. */
const AGENT_SIGNER_WEIGHT = 1;

async function main(): Promise<void> {
  const command = process.argv[2];
  const config = loadStellarM1Config();
  const server = new Horizon.Server(config.horizonUrl);
  const agent = Keypair.fromSecret(config.agentSignerSecret);

  if (command === 'verify') return verificar(server, config.demoAccountAddress, agent.publicKey());
  if (command === 'rotate') return rotar(server, config.demoAccountAddress, agent.publicKey());

  throw new StellarClientError(
    'INVALID_TRANSACTION',
    'Comandos: verify | rotate. Ver docs/runbooks/signer.md',
  );
}

/**
 * Comprueba que el signer que custodiamos está de verdad en la cuenta.
 *
 * Es el fallo silencioso más fácil de cometer: cambiar la seed en el entorno y
 * olvidarse de actualizar la cuenta. Todo arranca bien y falla en el primer
 * pago, que es el peor momento para descubrirlo.
 */
async function verificar(
  server: Horizon.Server,
  accountId: string,
  agentPublicKey: string,
): Promise<void> {
  const account = await server.loadAccount(accountId);
  const signer = account.signers.find((s) => s.key === agentPublicKey);

  const thresholds = {
    low: account.thresholds.low_threshold,
    medium: account.thresholds.med_threshold,
    high: account.thresholds.high_threshold,
  };

  if (!signer) {
    write({
      step: 'SIGNER_NOT_FOUND',
      ok: false,
      accountId,
      agentPublicKey,
      signersEnLaCuenta: account.signers.map((s) => ({ key: s.key, weight: s.weight })),
      queHacer:
        'La cuenta no reconoce este signer. O la seed del entorno no es la delegada, ' +
        'o la delegación nunca llegó a firmarse. Ejecuta `demo:signer rotate`.',
    });
    process.exitCode = 1;
    return;
  }

  // Poder firmar un pago pero no poder cambiar los signers es justo el reparto
  // que queremos: si el peso llegara al umbral alto, el agente podría quitarle
  // el control de la cuenta a su dueño.
  const puedePagar = signer.weight >= thresholds.medium;
  const puedeCambiarSigners = signer.weight >= thresholds.high;

  write({
    step: 'SIGNER_VERIFIED',
    ok: puedePagar && !puedeCambiarSigners,
    accountId,
    agentPublicKey,
    weight: signer.weight,
    thresholds,
    puedePagar,
    puedeCambiarSigners,
    ...(puedeCambiarSigners
      ? {
          aviso:
            'PELIGRO: el signer del agente alcanza el umbral alto. Podría cambiar los ' +
            'signers de la cuenta y dejar fuera a su dueño. Baja su peso.',
        }
      : {}),
    ...(puedePagar ? {} : { aviso: 'El signer no llega al umbral para firmar pagos.' }),
  });

  if (!puedePagar || puedeCambiarSigners) process.exitCode = 1;
}

/**
 * XDR para sustituir el signer del agente por uno nuevo.
 *
 * Añade el nuevo y quita el viejo **en la misma transacción**. Hacerlo en dos
 * pasos dejaría una ventana en la que la cuenta tiene dos signers válidos, o
 * ninguno, según el orden.
 *
 * Lo firma el dueño de la cuenta con su clave maestra: el agente no puede
 * rotarse a sí mismo, que es justo lo que impide que una clave comprometida se
 * perpetúe.
 */
async function rotar(
  server: Horizon.Server,
  accountId: string,
  currentAgentPublicKey: string,
): Promise<void> {
  const nuevo = process.env.STELLAR_NEW_AGENT_SIGNER_SECRET?.trim()
    ? Keypair.fromSecret(process.env.STELLAR_NEW_AGENT_SIGNER_SECRET.trim())
    : Keypair.random();

  validateAddress(nuevo.publicKey());

  if (nuevo.publicKey() === currentAgentPublicKey) {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'La clave nueva es la misma que la actual: rotar así no cambia nada.',
    );
  }

  const account = await server.loadAccount(accountId);
  const baseFee = await server.fetchBaseFee();

  const xdr = new TransactionBuilder(account, {
    fee: String(baseFee),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.setOptions({
        signer: { ed25519PublicKey: nuevo.publicKey(), weight: AGENT_SIGNER_WEIGHT },
      }),
    )
    .addOperation(
      // Peso 0 elimina el signer.
      Operation.setOptions({
        signer: { ed25519PublicKey: currentAgentPublicKey, weight: 0 },
      }),
    )
    .setTimeout(180)
    .build()
    .toXDR();

  write({
    step: 'SIGN_ROTATION_WITH_FREIGHTER',
    accountId,
    signerAntiguo: currentAgentPublicKey,
    signerNuevo: nuevo.publicKey(),
    nuevaSeed: nuevo.secret(),
    unsignedXdr: xdr,
    revisaAntesDeFirmar: [
      'Dos operaciones setOptions, ni una más.',
      `La primera añade ${nuevo.publicKey()} con peso ${AGENT_SIGNER_WEIGHT}.`,
      `La segunda pone ${currentAgentPublicKey} a peso 0.`,
      'Ninguna operación debe tocar masterWeight ni los thresholds.',
    ],
    despues: [
      'Pon la seed nueva en STELLAR_AGENT_SIGNER_SECRET y reinicia la API.',
      'Ejecuta `demo:signer verify` para confirmar que la cuenta la reconoce.',
      'La seed antigua ya no sirve: bórrala del gestor de secretos.',
    ],
  });
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
