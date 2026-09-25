# 0013 · Custodia y rotación de la clave del signer

- **Fecha:** 2026-09-25
- **Estado:** **Asumida** — aplica la regla de las 24 h de §14.1. Responde `BE1-Q2` y `BE1-Q3`
- **Decide:** BE2, pendiente de validar con BE1

## Contexto

`BE1-Q2` preguntaba dónde se custodia la clave del signer del agente: variable
cifrada, KMS o Vault. `BE1-Q3`, si hay un signer por usuario o uno global del
servicio. Ninguna se respondió, y BE1-10 no se podía cerrar sin decidirlo.

La pregunta importa porque esa clave **puede firmar pagos desde la cuenta del
usuario**. El `PLAN.md` ya lo dice sin adornos en §4.4: los límites se aplican
fuera de la cadena, así que una clave filtrada podría firmar cualquier importe
que la red permita.

## Decisión

### Dónde vive la clave

**En el gestor de secretos del proveedor de hosting, como variable de entorno.**
No KMS, no Vault.

Y conviene decir el límite en voz alta en vez de esconderlo: **quien pueda leer
el entorno del proceso puede firmar como el agente**. Un KMS no eliminaría el
problema —el proceso seguiría pudiendo pedir firmas— pero sí evitaría que la
clave exista en claro en memoria y dejaría rastro de cada uso.

No se hace ahora porque el MVP es testnet, el dinero no es real, y montar KMS
cuesta un tiempo que ahora mismo vale más en otro sitio. **Antes de mainnet esto
tiene que cambiar**, y así está anotado en §15 del PLAN.

Garantías que sí están implementadas:

- La seed solo se lee en `apps/api` y `packages/stellar`. Nunca va al frontend,
  ni al LLM, ni a la respuesta de ningún endpoint.
- La bitácora redacta cualquier clave que suene a secreto antes de persistir
  ([ADR 0004](0004-auditoria-encadenada.md)), y el logger redacta cabeceras de
  autorización.
- La CI busca claves secretas de Stellar en cada diff y falla si encuentra una.
- `loadEnv` obliga a que exista antes de arrancar contra la red real, para que
  nadie la ponga a medias.

### Un signer global, no uno por usuario

`BE1-Q3`: **uno global del servicio**. Es lo que ya asumía el runbook M1 y lo
que el ejecutor impone al limitar la firma a una única cuenta permitida.

Un signer por usuario sería mejor —el radio de daño de una filtración sería una
cuenta en vez de todas— pero exige generar, custodiar y rotar N claves, que es
justo el problema que no estamos resolviendo bien todavía con una. Hacerlo con
una primero y bien es más honesto que hacerlo con N y mal.

### El peso del signer es lo que de verdad acota el daño

El signer del agente entra con **peso 1** y los umbrales quedan en `1/1/2`. Eso
significa que puede firmar pagos pero **no** puede cambiar los signers de la
cuenta: no puede dejar fuera a su dueño ni perpetuarse.

`demo:signer verify` lo comprueba contra la red y **falla** si el peso llega al
umbral alto.

### Rotar tiene que ser fácil

Una clave que no se puede cambiar sin dolor es una clave que nadie cambia.
`demo:signer rotate` genera la clave nueva y prepara el XDR que añade la nueva y
quita la vieja **en la misma transacción**: en dos pasos habría una ventana con
dos signers válidos o con ninguno, según el orden.

Lo firma el dueño con su clave maestra. **El agente no puede rotarse a sí
mismo**, que es justo lo que impide que una clave comprometida se perpetúe.

## Alternativas

- **KMS o Vault.** Lo correcto para mainnet. Descartado ahora por coste de
  montaje frente a un MVP en testnet, no porque sobre.
- **Cifrar la seed en la base de datos.** Suena mejor y no lo es: la clave de
  descifrado acabaría en el mismo entorno, así que solo se añade un paso.
- **Un signer por usuario.** Mejor aislamiento, peor gestión. Ver arriba.
- **Cuenta-bolsillo del agente con presupuesto acotado** (el spike `SP-1` del
  PLAN). Es la alternativa que de verdad cambiaría el modelo de riesgo, porque
  el daño quedaría limitado al saldo del bolsillo. Sigue mereciendo la pena y no
  está descartada.

## Consecuencias

- ⚠️ **Esta decisión no es válida para mainnet.** Está marcada como asumida a
  propósito: si BE1 no está de acuerdo, es una de las que más conviene discutir.
- La demo puede rotar la clave delante del jurado, que es una forma barata de
  demostrar que el problema está pensado y no ignorado.
- `demo:signer verify` debería ejecutarse antes de grabar el video: detecta el
  fallo silencioso de haber cambiado la seed y no la cuenta.
