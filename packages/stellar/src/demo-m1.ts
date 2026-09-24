import type { ResolvedAction } from '@aegis/contracts';
import { StellarClientError } from './errors.js';
import { loadStellarM1Config } from './config.js';
import { HorizonAccountClient } from './horizon-account-client.js';
import { HorizonStellarExecutor } from './horizon-executor.js';

async function main(): Promise<void> {
  const command = process.argv[2];
  const config = loadStellarM1Config();
  const client = new HorizonAccountClient({ horizonUrl: config.horizonUrl });
  const executor = new HorizonStellarExecutor({
    horizonUrl: config.horizonUrl,
    agentSignerSecret: config.agentSignerSecret,
    allowedSourceAccount: config.demoAccountAddress,
    transactionTimeoutSeconds: config.transactionTimeoutSeconds,
  });

  if (command === 'prepare') {
    const balances = await client.getBalances(config.demoAccountAddress);
    const { xdr } = await executor.buildDelegationXdr(
      config.demoAccountAddress,
      executor.agentPublicKey,
    );
    write({
      step: 'SIGN_DELEGATION_WITH_FREIGHTER',
      account: config.demoAccountAddress,
      agentPublicKey: executor.agentPublicKey,
      balance: balances[0],
      unsignedXdr: xdr,
    });
    return;
  }

  if (command === 'submit-delegation') {
    const signedXdr = (await readStdin()).trim();
    if (!signedXdr) {
      throw new StellarClientError(
        'INVALID_TRANSACTION',
        'Pasa el XDR firmado por stdin; no lo pongas en los argumentos.',
      );
    }
    const { hash } = await executor.submit(signedXdr);
    writeTransaction(hash);
    return;
  }

  if (command === 'pay') {
    const destination = requiredDemoEnv('STELLAR_DEMO_DESTINATION');
    const amount = process.env.STELLAR_DEMO_AMOUNT?.trim() || '0.1000000';
    const before = await client.getBalances(config.demoAccountAddress);
    const action: ResolvedAction = {
      type: 'PAYMENT',
      destinationId: 'm1-demo',
      destinationAddress: destination,
      destinationLabel: 'Destino M1',
      asset: 'XLM',
      amount,
      memo: 'Aegis M1',
      label: 'Pago de checkpoint M1',
    };
    const unsigned = await executor.buildUnsigned(config.demoAccountAddress, [action]);
    const signed = await executor.signWithAgent(unsigned.xdr);
    const { hash } = await executor.submit(signed.xdr);
    const after = await client.getBalances(config.demoAccountAddress);
    write({
      step: 'PAYMENT_CONFIRMED',
      before: before[0],
      after: after[0],
      hash,
      explorer: explorerUrl(hash),
    });
    return;
  }

  throw new StellarClientError(
    'INVALID_TRANSACTION',
    'Uso: demo:m1 prepare | submit-delegation | pay',
  );
}

function requiredDemoEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new StellarClientError('INVALID_TRANSACTION', `Falta la variable ${name}.`);
  return value;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function writeTransaction(hash: string): void {
  write({ step: 'TRANSACTION_CONFIRMED', hash, explorer: explorerUrl(hash) });
}

function explorerUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  const safe =
    error instanceof StellarClientError
      ? { error: { code: error.code, message: error.message, retryable: error.retryable } }
      : { error: { code: 'UNEXPECTED', message: 'Falló la demo M1.' } };
  process.stderr.write(`${JSON.stringify(safe, null, 2)}\n`);
  process.exitCode = 1;
});
