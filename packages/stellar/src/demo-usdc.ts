import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { ON_CHAIN_ASSET_CODE } from './assets.js';
import { StellarClientError } from './errors.js';
import { validateAddress, validateHorizonUrl } from './horizon-account-client.js';

/**
 * Emisor del activo de prueba (BE1-11).
 *
 * Aegis mueve dólares, y en testnet no hay USDC de verdad: hay que emitir uno
 * propio. Este comando crea la cuenta emisora, prepara la trustline que el
 * usuario debe firmar y reparte el activo.
 *
 * **En la red el activo se llama `USDCTEST`, sin guion bajo.** Stellar solo
 * admite códigos alfanuméricos; dentro de Aegis sigue siendo `USDC_TEST`.
 *
 * Tres comandos, en este orden:
 *
 *   pnpm --filter @aegis/stellar demo:usdc issuer     → crea y fondea el emisor
 *   pnpm --filter @aegis/stellar demo:usdc trustline  → XDR para que lo firme el usuario
 *   pnpm --filter @aegis/stellar demo:usdc fund       → el emisor envía el activo
 *
 * Solo testnet. La seed del emisor se imprime una vez, al crearla: guárdala en
 * `.env` y no la vuelvas a pedir, porque no hay forma de recuperarla.
 */

const ASSET_CODE = ON_CHAIN_ASSET_CODE.USDC_TEST;
const DEFAULT_TRUST_LIMIT = '1000000';
const DEFAULT_FUND_AMOUNT = '1000';

interface Config {
  horizonUrl: string;
  friendbotUrl: string;
  demoAccountAddress: string;
  issuerSecret?: string;
  trustLimit: string;
  fundAmount: string;
  timeoutSeconds: number;
}

function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  if ((source.STELLAR_NETWORK ?? 'testnet') !== 'testnet') {
    throw new StellarClientError('INVALID_TRANSACTION', 'Este comando solo opera en testnet.');
  }

  const horizonUrl = source.STELLAR_HORIZON_URL?.trim() ?? 'https://horizon-testnet.stellar.org';
  const demoAccountAddress = source.STELLAR_DEMO_ACCOUNT_ADDRESS?.trim();

  if (!demoAccountAddress) {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'Falta STELLAR_DEMO_ACCOUNT_ADDRESS: es la cuenta que va a recibir el activo.',
    );
  }

  validateHorizonUrl(horizonUrl);
  validateAddress(demoAccountAddress);

  return {
    horizonUrl,
    friendbotUrl: source.STELLAR_FRIENDBOT_URL?.trim() ?? 'https://friendbot.stellar.org',
    demoAccountAddress,
    ...(source.USDC_TEST_ISSUER_SECRET?.trim()
      ? { issuerSecret: source.USDC_TEST_ISSUER_SECRET.trim() }
      : {}),
    trustLimit: source.USDC_TEST_TRUST_LIMIT?.trim() ?? DEFAULT_TRUST_LIMIT,
    fundAmount: source.USDC_TEST_FUND_AMOUNT?.trim() ?? DEFAULT_FUND_AMOUNT,
    timeoutSeconds: Number(source.STELLAR_TRANSACTION_TIMEOUT_SECONDS ?? '180'),
  };
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const config = loadConfig();
  const server = new Horizon.Server(config.horizonUrl);

  if (command === 'issuer') return crearEmisor(config);
  if (command === 'trustline') return prepararTrustline(config, server);
  if (command === 'fund') return repartir(config, server);

  throw new StellarClientError(
    'INVALID_TRANSACTION',
    'Comandos: issuer | trustline | fund. Ver docs/runbooks/usdc-test.md',
  );
}

/**
 * Crea y fondea la cuenta emisora.
 *
 * La seed se imprime **una sola vez**. Es lo único que permite emitir más
 * activo, así que si se pierde hay que empezar de cero con un emisor nuevo, y
 * todas las trustlines existentes dejan de servir.
 */
async function crearEmisor(config: Config): Promise<void> {
  const issuer = Keypair.random();

  const response = await fetch(
    `${config.friendbotUrl}?addr=${encodeURIComponent(issuer.publicKey())}`,
  );

  if (!response.ok) {
    throw new StellarClientError(
      'NETWORK_UNAVAILABLE',
      `Friendbot no pudo fondear la cuenta emisora (HTTP ${response.status}).`,
    );
  }

  write({
    step: 'ISSUER_CREATED',
    assetCode: ASSET_CODE,
    issuerPublicKey: issuer.publicKey(),
    issuerSecret: issuer.secret(),
    guardaEstoEn: {
      USDC_TEST_ISSUER: issuer.publicKey(),
      USDC_TEST_ISSUER_SECRET: `${issuer.secret()}  ← solo para este comando, NO para la API`,
    },
    siguiente: 'pnpm --filter @aegis/stellar demo:usdc trustline',
  });
}

/**
 * XDR para que la cuenta del usuario confíe en el activo.
 *
 * La trustline la firma **el titular de la cuenta**, no el emisor: nadie puede
 * obligarte a aceptar un token. Por eso se devuelve sin firmar, igual que la
 * delegación del signer en M1.
 */
async function prepararTrustline(config: Config, server: Horizon.Server): Promise<void> {
  const issuerPublicKey = requireIssuerPublicKey(config);
  const account = await server.loadAccount(config.demoAccountAddress);
  const baseFee = await server.fetchBaseFee();

  const xdr = new TransactionBuilder(account, {
    fee: String(baseFee),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(ASSET_CODE, issuerPublicKey),
        limit: config.trustLimit,
      }),
    )
    .setTimeout(config.timeoutSeconds)
    .build()
    .toXDR();

  write({
    step: 'SIGN_TRUSTLINE_WITH_FREIGHTER',
    account: config.demoAccountAddress,
    asset: `${ASSET_CODE}:${issuerPublicKey}`,
    limit: config.trustLimit,
    unsignedXdr: xdr,
    revisaAntesDeFirmar: [
      'La operación debe ser exactamente una, de tipo changeTrust.',
      `El emisor debe ser ${issuerPublicKey}.`,
      'La red debe ser TESTNET.',
    ],
    siguiente: 'pnpm --filter @aegis/stellar demo:usdc fund',
  });
}

/** El emisor envía el activo a la cuenta demo. Firma el emisor, cuya seed sí tenemos. */
async function repartir(config: Config, server: Horizon.Server): Promise<void> {
  const issuer = requireIssuerKeypair(config);
  const account = await server.loadAccount(issuer.publicKey());
  const baseFee = await server.fetchBaseFee();

  const transaction = new TransactionBuilder(account, {
    fee: String(baseFee),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: config.demoAccountAddress,
        asset: new Asset(ASSET_CODE, issuer.publicKey()),
        amount: config.fundAmount,
      }),
    )
    .setTimeout(config.timeoutSeconds)
    .build();

  transaction.sign(issuer);

  try {
    const result = await server.submitTransaction(transaction);
    write({
      step: 'FUNDED',
      amount: config.fundAmount,
      asset: `${ASSET_CODE}:${issuer.publicKey()}`,
      destination: config.demoAccountAddress,
      hash: result.hash,
      explorer: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
    });
  } catch (error) {
    // El fallo más probable con diferencia: la trustline no está firmada.
    const codes = extractResultCodes(error);
    if (codes.includes('op_no_trust')) {
      throw new StellarClientError(
        'UNSUPPORTED_ASSET',
        'La cuenta destino no tiene trustline del activo. Firma primero el XDR de `trustline`.',
      );
    }
    throw error;
  }
}

function requireIssuerPublicKey(config: Config): string {
  const fromEnv = process.env.USDC_TEST_ISSUER?.trim();
  if (fromEnv) {
    validateAddress(fromEnv);
    return fromEnv;
  }

  return requireIssuerKeypair(config).publicKey();
}

function requireIssuerKeypair(config: Config): Keypair {
  if (!config.issuerSecret) {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'Falta USDC_TEST_ISSUER_SECRET. Créalo con `demo:usdc issuer` y guárdalo.',
    );
  }

  try {
    return Keypair.fromSecret(config.issuerSecret);
  } catch {
    throw new StellarClientError(
      'INVALID_TRANSACTION',
      'USDC_TEST_ISSUER_SECRET no es una seed Stellar válida.',
    );
  }
}

/** Saca los códigos de resultado del error de Horizon, si vienen. */
function extractResultCodes(error: unknown): string[] {
  const data = (error as { response?: { data?: { extras?: { result_codes?: unknown } } } })
    ?.response?.data?.extras?.result_codes;

  if (!data || typeof data !== 'object') return [];

  const { transaction, operations } = data as { transaction?: string; operations?: string[] };
  return [transaction, ...(operations ?? [])].filter((code): code is string => Boolean(code));
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
