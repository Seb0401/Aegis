# Runbook · emitir el activo de prueba (BE1-11)

Aegis mueve dólares, y en testnet no hay USDC de verdad: hay que emitir uno
propio. Sin esto, contra la red real solo se pueden enviar **XLM**, y todo el
caso de uso del producto está pensado en dólares.

> **El activo se llama `USDCTEST` en la red, sin guion bajo.** Stellar solo
> admite códigos alfanuméricos de 1 a 12 caracteres. Dentro de Aegis se sigue
> llamando `USDC_TEST`; la traducción está en `packages/stellar/src/assets.ts`.

---

## Antes de empezar

Necesitas en el entorno:

```dotenv
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_DEMO_ACCOUNT_ADDRESS=G...   # la cuenta que va a recibir el activo
```

El comando **no lee el `.env`**. Exporta las variables en la terminal:
`export NOMBRE=valor` en Bash, `$env:NOMBRE="valor"` en PowerShell.

---

## 1. Crear la cuenta emisora

```bash
pnpm --filter @aegis/stellar demo:usdc issuer
```

Genera una cuenta nueva, la fondea con Friendbot e imprime dos cosas:

- `USDC_TEST_ISSUER` — la clave pública. **Va al entorno de la API.**
- `USDC_TEST_ISSUER_SECRET` — la seed. **Solo para estos comandos, nunca para
  la API.** La API no necesita emitir: solo mover lo ya emitido.

> La seed se imprime **una sola vez**. Es lo único que permite emitir más
> activo. Si se pierde hay que empezar de cero con un emisor nuevo, y todas las
> trustlines que existieran dejan de servir.

Guárdala donde guardes los secretos y bórrala del historial de la terminal.

---

## 2. Que la cuenta del usuario confíe en el activo

```bash
export USDC_TEST_ISSUER=G...
pnpm --filter @aegis/stellar demo:usdc trustline
```

Devuelve un XDR **sin firmar**. La trustline la firma el titular de la cuenta,
no el emisor: en Stellar nadie puede obligarte a aceptar un token.

Ábrelo en [Stellar Laboratory](https://laboratory.stellar.org) con testnet
seleccionado y comprueba **antes de firmar**:

- Una sola operación, de tipo `changeTrust`.
- El emisor es el tuyo, carácter por carácter.
- La red es TESTNET.

Fírmalo con Freighter y envíalo.

---

## 3. Repartir el activo

```bash
export USDC_TEST_ISSUER_SECRET=S...
pnpm --filter @aegis/stellar demo:usdc fund
```

El emisor envía 1000 `USDCTEST` a la cuenta demo (ajustable con
`USDC_TEST_FUND_AMOUNT`). Firma el emisor, cuya seed sí tenemos, así que no hay
nada que firmar a mano.

Si falla con `op_no_trust`, la trustline del paso 2 no llegó a firmarse. El
comando lo detecta y lo dice con esas palabras.

---

## 4. Conectarlo con la API

En el entorno de la API:

```dotenv
USDC_TEST_ISSUER=G...
```

Sin esta variable, el ejecutor **rechaza cualquier pago que no sea XLM**. Es a
propósito: firmar un activo con un emisor desconocido sería firmar un token que
puede haber creado cualquiera.

Comprueba que funciona:

```bash
curl -s localhost:3001/account/balances -H "authorization: Bearer $TOKEN"
```

Debe aparecer `USDC_TEST` junto a `XLM`.

---

## Problemas frecuentes

| Síntoma                                                      | Causa                                             | Solución                                                |
| ------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| `op_no_trust` al repartir                                    | La trustline no está firmada                      | Repite el paso 2 y **envía** la transacción firmada     |
| La API dice `UNSUPPORTED_ASSET`                              | Falta `USDC_TEST_ISSUER` en su entorno            | Añádela y reinicia                                      |
| `El activo no es XLM ni el USDC_TEST del emisor configurado` | El emisor del entorno no coincide con el del pago | Son dos emisores distintos: mismo nombre, valor ninguno |
| El saldo no aparece                                          | La trustline existe pero no hay fondos            | Paso 3                                                  |
| Todo desapareció                                             | Reinicio trimestral de testnet                    | Repite los tres pasos: el emisor también se borra       |

---

## Por qué el emisor es una cuenta aparte

Podría emitirse desde la cuenta demo y ahorrarse un paso. No se hace porque en
Stellar el emisor de un activo **no tiene saldo de ese activo**: lo crea al
pagarlo y lo destruye al recibirlo. Mezclar emisor y usuario haría que los
saldos no significaran lo que parece, y el Guardian razona sobre esos saldos.
