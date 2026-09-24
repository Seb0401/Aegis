# Runbook · M1 “Hola Stellar”

Objetivo: delegar el signer global de Aegis y confirmar un pago XLM real en
Stellar testnet sin entregar la clave principal al backend.

## Preparación

1. Instala dependencias con `pnpm install`.
2. Selecciona testnet en Freighter, crea la cuenta demo y fúndala con
   [Friendbot](https://friendbot.stellar.org/).
3. Genera una seed independiente para el agente y guárdala únicamente en
   `.env` como `STELLAR_AGENT_SIGNER_SECRET`. No uses la seed de la cuenta demo.
4. Completa:

```dotenv
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_DEMO_ACCOUNT_ADDRESS=G...
STELLAR_AGENT_SIGNER_SECRET=S...
STELLAR_TRANSACTION_TIMEOUT_SECONDS=180
STELLAR_DEMO_DESTINATION=G...
STELLAR_DEMO_AMOUNT=0.1000000
```

Carga esas variables en la terminal. El comando no lee automáticamente `.env`.
En PowerShell puede hacerse con `$env:NOMBRE="valor"`; en Bash, con
`export NOMBRE="valor"`.

## 1. Preparar y firmar la delegación

```bash
pnpm --filter @aegis/stellar demo:m1 prepare
```

La salida contiene la clave pública del agente, saldo y un `unsignedXdr`. Abre
el XDR en Stellar Laboratory configurado para testnet, revisa que contenga solo
`SetOptions` con pesos `master=2`, `agent=1`, thresholds `1/1/2`, y fírmalo con
la cuenta demo mediante Freighter.

No firmes si la cuenta, red, operación o pesos no coinciden.

## 2. Enviar la delegación

Pasa el XDR firmado por stdin, nunca como argumento. Ejemplo PowerShell:

```powershell
Get-Clipboard | pnpm --filter @aegis/stellar demo:m1 submit-delegation
```

Ejemplo Bash:

```bash
pbpaste | pnpm --filter @aegis/stellar demo:m1 submit-delegation
```

El resultado incluye el hash y su enlace al explorador de testnet. Comprueba en
la cuenta que el signer y los thresholds quedaron registrados.

## 3. Ejecutar el pago delegado

Funda previamente `STELLAR_DEMO_DESTINATION` con Friendbot. Después ejecuta:

```bash
pnpm --filter @aegis/stellar demo:m1 pay
```

El comando consulta el saldo, construye un único pago XLM, comprueba su origen y
operaciones, firma con el agente, lo envía y muestra saldo anterior, saldo
posterior, hash y enlace al explorador.

## Recuperación

| Código                | Acción                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| `ACCOUNT_NOT_FOUND`   | Funda la cuenta con Friendbot y confirma la red testnet.                                |
| `INVALID_TRANSACTION` | Revisa cuenta demo, destino, monto y que el XDR sea de testnet.                         |
| `UNSUPPORTED_ASSET`   | Usa XLM; `USDC_TEST` llega después de M1.                                               |
| `TX_REJECTED`         | Revisa signer/thresholds y el resultado de Horizon. No reenvíes otro pago a ciegas.     |
| `NETWORK_UNAVAILABLE` | Comprueba Horizon y vuelve a intentar cuando el servicio responda.                      |
| `TX_STATUS_UNKNOWN`   | Busca el hash/XDR en Horizon antes de reenviar; la reconciliación automática es BE1-09. |

Para retirar el acceso después de la demo, crea y firma con la clave principal
una operación `SetOptions` que deje el signer del agente con peso `0`.
