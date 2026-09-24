# @aegis/stellar

**Dueño: BE1** (ver `.github/CODEOWNERS`).

Único paquete que importa `@stellar/stellar-sdk`. El resto del backend consume
los puertos de `@aegis/contracts`.

## Estado

El checkpoint **M1 “Hola Stellar”** está implementado para testnet:

- `HorizonAccountClient`: existencia de cuenta y saldo XLM total/disponible.
- `HorizonStellarExecutor`: XDR de delegación, pago XLM, firma del agente y envío.
- signer global limitado a una cuenta demo y transacciones testnet.
- fakes deterministas para la API y los tests del resto del monorepo.

El ejecutor M1 acepta exactamente un pago XLM. Batch, `USDC_TEST`, historial,
simulación, rotación y reconciliación pertenecen a BE1-06…BE1-11.

## Seguridad M1

La delegación configura master `2`, agente `1`, thresholds `1/1/2`. El agente
puede autorizar un pago, pero no una operación de threshold alto como cambiar
signers. Además, `signWithAgent` rechaza otra cuenta, otros activos y cualquier
operación que no sea un único pago.

La seed del agente solo entra por `STELLAR_AGENT_SIGNER_SECRET`: no se acepta por
CLI, no se devuelve y no se incluye en errores. Este modelo es deliberadamente
de demo; la custodia y rotación por usuario son BE1-10.

## Demo

Consulta el runbook reproducible en [`docs/runbooks/stellar-m1.md`](../../docs/runbooks/stellar-m1.md).

```bash
pnpm --filter @aegis/stellar demo:m1 prepare
pnpm --filter @aegis/stellar demo:m1 submit-delegation < signed.xdr
pnpm --filter @aegis/stellar demo:m1 pay
```

La API conserva `USE_FAKE_STELLAR=true` durante M1. El cableado real del flujo
completo y la eliminación de la clave pública suministrada por el frontend son
trabajo de M2.

## Pruebas

```bash
pnpm --filter @aegis/stellar test

# Opt-in: crea cuentas efímeras y envía transacciones en testnet.
RUN_STELLAR_TESTNET=true pnpm --filter @aegis/stellar test
```

Las decisiones BE1-Q1…Q5 quedan resueltas **solo para M1**: Horizon, seed en
entorno local, signer global, fees pagadas por la cuenta origen y signer sobre
la cuenta principal.
