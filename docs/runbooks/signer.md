# Runbook · la clave del agente: custodia, verificación y rotación

La seed del signer del agente es lo que le permite a Aegis firmar pagos desde la
cuenta del usuario. El razonamiento sobre dónde vive y por qué está en el
[ADR 0013](../adr/0013-custodia-del-signer.md); aquí están los comandos.

> Solo testnet. Todos los comandos leen las variables del entorno, **no del
> `.env`**: expórtalas antes.

---

## Las reglas

1. **La seed solo existe en el entorno del backend.** Nunca en el repositorio,
   nunca en el frontend, nunca en un mensaje al LLM, nunca en un log.
2. **Es distinta de la clave maestra de la cuenta.** El backend nunca debe tener
   la seed del usuario: si las mezclas, la delegación pierde todo el sentido.
3. **Peso 1, umbrales `1/1/2`.** El agente puede firmar pagos, no puede cambiar
   los signers de la cuenta. Ese reparto es lo que de verdad acota el daño.

---

## Verificar

```bash
export STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
export STELLAR_DEMO_ACCOUNT_ADDRESS=G...
export STELLAR_AGENT_SIGNER_SECRET=S...

pnpm --filter @aegis/stellar demo:signer verify
```

Comprueba contra la red que la cuenta reconoce el signer que custodias, con qué
peso y frente a qué umbrales. **Sale con error si algo no cuadra**:

| Resultado                        | Qué significa                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SIGNER_VERIFIED` con `ok: true` | Puede firmar pagos y no puede tocar los signers. Es lo que queremos                                     |
| `SIGNER_NOT_FOUND`               | La cuenta no conoce esta clave. O la seed del entorno no es la delegada, o la delegación nunca se firmó |
| `puedeCambiarSigners: true`      | **Peligro.** El agente podría dejar fuera al dueño de la cuenta. Baja su peso                           |
| `puedePagar: false`              | El peso no llega al umbral: los pagos fallarán                                                          |

Este comando existe por un fallo silencioso concreto y muy fácil de cometer:
cambiar la seed en el entorno y olvidarse de actualizar la cuenta. Todo arranca
bien y falla en el primer pago, que es el peor momento para enterarse.

**Ejecútalo antes de grabar el video.**

---

## Rotar

Cuando la clave se haya podido filtrar, cuando alguien con acceso deje el
equipo, o simplemente de forma periódica.

```bash
pnpm --filter @aegis/stellar demo:signer rotate
```

Genera una clave nueva y prepara un XDR que **añade la nueva y quita la vieja en
la misma transacción**. En dos pasos habría una ventana con dos signers válidos
o con ninguno, según el orden.

Lo firma **el dueño de la cuenta con su clave maestra**. El agente no puede
rotarse a sí mismo: eso es justo lo que impide que una clave comprometida se
perpetúe.

Revisa antes de firmar:

- Dos operaciones `setOptions`, ni una más.
- La primera añade la clave nueva con peso 1.
- La segunda pone la antigua a peso 0.
- Ninguna toca `masterWeight` ni los thresholds.

Después:

1. Pon la seed nueva en `STELLAR_AGENT_SIGNER_SECRET` y reinicia la API.
2. `demo:signer verify` para confirmar.
3. **Borra la seed antigua** del gestor de secretos. Ya no sirve para nada y
   sigue siendo un secreto que alguien puede filtrar.

Para usar una clave que ya tengas en vez de generar una:
`STELLAR_NEW_AGENT_SIGNER_SECRET=S...`

---

## Si crees que la clave se filtró

En este orden:

1. **Kill switch primero.** `POST /policy/pause` con `{"paused": true}`. Para el
   agente al instante, antes de tocar nada más. Es más rápido que rotar.
2. **Rota la clave** con el procedimiento de arriba.
3. **Revisa la bitácora.** `GET /audit` muestra las operaciones y si la cadena
   de hashes está íntegra. Busca `AGENT_SIGNED` y `TX_SUBMITTED` que no
   reconozcas.
4. **Quita la pausa** cuando la clave nueva esté verificada.

El orden importa: rotar primero deja al agente operativo con la clave vieja
durante todo el rato que tardes en preparar y firmar la rotación.

---

## Lo que esto NO resuelve

Quien pueda leer el entorno del proceso puede firmar como el agente. Eso no se
arregla rotando, se arregla con un KMS, y el ADR 0013 explica por qué no está
hecho todavía y por qué **tiene que estarlo antes de mainnet**.
