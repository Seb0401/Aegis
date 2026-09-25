# 0014 · x402 y límites on-chain con Soroban: qué costaría

- **Fecha:** 2026-09-25
- **Estado:** Informe, **no es una decisión**. Sirve para tomarla con datos
- **Contexto:** la guía del hackathon marca x402 como propio del track Agentes y
  menciona un "entregable de evidencia on-chain" sin precisar si es obligatorio

---

## 1. x402 — pagos agénticos

### Qué es, según la documentación oficial

Un protocolo abierto de Coinbase Developer Platform para **pagos por petición
HTTP**, pensado para agentes de IA y APIs. Reutiliza el código de estado 402 y,
sobre Stellar, se apoya en **autorizaciones de Soroban** (auth entries) en vez
de transacciones clásicas.

Piezas que exige:

| Pieza           | Qué hace                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------- |
| **Servidor**    | Expone los endpoints x402 y cobra en tokens SEP-41                                             |
| **Facilitador** | Verifica y liquida en cadena. Hay el de Coinbase (testnet) o el plugin de OpenZeppelin Relayer |
| **Cliente**     | Wallet capaz de firmar auth entries: Freighter, Albedo, Hana, Klever y otras                   |

Activo: **USDC**. En testnet el emisor es
`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. Paquete:
`x402-stellar` en npm.

### Qué tiene que ver con Aegis

**x402 va en la dirección contraria a la nuestra, y eso es justo lo
interesante.** x402 resuelve que un agente _pague_ por servicios; Aegis
resuelve _cuánto puede gastar_ un agente y quién lo autoriza. Encajan:

> Un agente consume APIs de pago vía x402. Aegis es la capa que le impone
> límites, analiza cada gasto y deja rastro. Hoy le cobran por petición y nadie
> vigila el total.

No hace falta implementarlo para contarlo: es una frase del pitch, y es honesta
porque el servidor MCP ya hace exactamente eso para pagos normales.

### Qué costaría implementarlo

| Trabajo                                              | Dificultad                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Firmar auth entries en vez de transacciones clásicas | **Alta.** Nuestro ejecutor solo construye y firma pagos clásicos. Es un camino nuevo entero |
| Montar o conectar un facilitador                     | Media. El de Coinbase en testnet quita trabajo                                              |
| Que Policy Engine y Guardian entiendan un gasto x402 | Baja. Un gasto es un gasto; las reglas ya son genéricas                                     |
| El frontend                                          | Baja. Stellar Wallets Kit ya cubre las wallets compatibles                                  |

**Estimación honesta: 2–3 días**, y el grueso está en el primer punto, que toca
la parte del sistema donde un error significa firmar algo que nadie revisó.

**Recomendación:** contarlo en el pitch como el encaje natural, no
implementarlo. El coste está concentrado justo donde más cuidado hay que tener.

---

## 2. Límites on-chain con Soroban

### La buena noticia: no habría que escribir Rust

Existe el **framework de smart accounts de OpenZeppelin para Soroban** y un SDK
de TypeScript oficial, `smart-account-kit`, con **clientes tipados para
políticas de límite de gasto** ya hechas. También hay librerías de terceros
(Mandate) con políticas componibles de cuánto se puede gastar por periodo.

Eso cambia el cálculo por completo respecto a lo que supuse antes: la idea no
era "escribir un contrato", sino "usar uno que ya existe".

### La mala: hay dos obstáculos concretos

**Uno, incompatibilidad de versiones.** `smart-account-kit` exige
`@stellar/stellar-sdk` **16.3.x** y dice explícitamente que no es compatible con
la 17. Nosotros resolvemos **13.3.0** en `packages/stellar`, y el frontend
arrastra una 17.1.0 por Stellar Wallets Kit. Son tres versiones que no encajan
entre sí. Se puede resolver aislando el SDK en su propio paquete, pero es
trabajo de fontanería antes de escribir una línea útil.

**Dos, madurez.** El propio README avisa de que el SDK, el demo y el relayer
**no tienen auditoría independiente**, y recomienda no guardar ahí activos que
no puedas permitirte perder. Para testnet da igual; para el discurso importa,
porque el argumento sería "los límites se aplican on-chain" apoyado en algo
experimental.

Además exige **Protocol 27**, así que hay que comprobar en qué protocolo está
testnet el día de la demo.

### Qué costaría

| Trabajo                                                          | Dificultad                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Aislar la versión del SDK                                        | Media. Fontanería de monorepo                                                                  |
| Desplegar la smart account y la política de límite               | Media. El SDK lo cubre                                                                         |
| Migrar la cuenta demo de signer clásico a smart account          | **Alta.** Cambia el modelo de firma entero: los thresholds de §4.4 dejan de aplicar como ahora |
| Que el Policy Engine sepa qué está garantizado on-chain y qué no | Media. Y conceptualmente delicado                                                              |

**Estimación honesta: 3–5 días**, con riesgo alto de no terminarlo.

### Qué ganaría

Lo que ganaría es real y es grande: el `PLAN.md` confiesa en §4.4 que **los
límites se aplican fuera de la cadena**, así que una clave filtrada podría
firmar cualquier importe. Un límite on-chain convierte esa debilidad confesada
en la mayor fortaleza del proyecto.

---

## 3. Recomendación

**No hacer ninguno de los dos antes de la demo**, salvo que se confirme que la
evidencia on-chain es obligatoria.

El razonamiento: las dos cosas tocan la parte del sistema donde un error
significa firmar algo que nadie revisó, y ninguna arregla nada que hoy esté
roto. El tiempo rinde más en desplegar, grabar el video y ensayar el flujo.

**Si resulta obligatorio**, el camino más corto es el de Soroban con
`smart-account-kit`, y el primer paso es aislar la versión del SDK. Conviene
saber que ese primer paso no produce nada demostrable: es fontanería, y hay que
contarlo en el plan para no descubrirlo a mitad.

**Lo que sí se ha hecho con esta investigación** es aprovechar un hallazgo
barato: el USDC canónico de testnet existe y ya se puede usar con
`USDC_TEST_ASSET_CODE=USDC` y su emisor. Ahorra montar y mantener un emisor
propio, y es el mismo activo que usa x402.

## Fuentes

- [x402 en Stellar](https://developers.stellar.org/docs/build/agentic-payments/x402)
- [smart-account-kit](https://github.com/stellar/smart-account-kit)
- [Contratos de OpenZeppelin para Stellar](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/accounts)
- [Mandate: políticas de gasto componibles](https://github.com/SoroMandate/Mandate)
