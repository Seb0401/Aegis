# @aegis/stellar

**Dueño: BE1** (ver `.github/CODEOWNERS`).

Este paquete encapsula todo lo que toca la red Stellar. El resto del backend
nunca importa `@stellar/stellar-sdk` directamente: consume las interfaces
`StellarReader` y `StellarExecutor` definidas en `@aegis/contracts`.

## Estado actual

Solo está el **andamiaje**: las interfaces, un `FakeStellarReader` con datos de
prueba y un `NotImplementedStellarExecutor` que lanza un error claro. La
implementación real contra Horizon/RPC es el trabajo de BE1 (tareas BE1-01 a
BE1-11 del `PLAN.md`).

## Para qué sirve el fake

`@aegis/api` arranca con `USE_FAKE_STELLAR=true` y usa `FakeStellarReader`, así
que BE2 puede construir la API, las políticas y el Guardian sin esperar a que la
integración real esté lista (§6.2 del `PLAN.md`).

```ts
import { FakeStellarReader } from '@aegis/stellar/testing';

const reader = new FakeStellarReader();
await reader.getBalances('G...');
```

## Preguntas abiertas para BE1

Siguen sin responder (§14.3 del `PLAN.md`): `BE1-Q1` (Horizon o RPC), `BE1-Q2`
(custodia de la clave del signer), `BE1-Q3` (signer por usuario o global),
`BE1-Q4` (quién paga las comisiones) y `BE1-Q5` (resultado del spike `SP-1`).
