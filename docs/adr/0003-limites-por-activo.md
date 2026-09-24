# 0003 · Los límites se aplican por activo, sin conversión

- **Fecha:** 2026-09-19
- **Estado:** **Sustituida** por [ADR 0011](0011-precios-en-dolares.md) el 2026-09-24
- **Decide:** BE2, pendiente de validar

## Contexto

Las reglas P-01, P-02 y P-06 están escritas en dólares ("máx. $5 por operación",
"límite diario $20", "reserva mínima $10"), pero el sistema mueve `XLM` y
`USDC_TEST`, que no valen lo mismo. Convertir a dólares exigiría un oráculo de
precios que no está en el alcance del MVP.

## Decisión

Los límites se comparan **directamente contra el monto del activo**, sin
conversión. Un límite de `5` significa "5 unidades del activo que se envía", sea
XLM o USDC_TEST.

- P-01 y P-06 se evalúan por activo.
- P-02 acumula por activo en el motor, pero `PolicySummary.remainingDailyAmount`
  suma todos los activos porque el agente solo necesita una señal aproximada.

## Alternativas

- **Oráculo de precios.** Correcto pero fuera de alcance: añade una dependencia
  externa, un modo de fallo nuevo y una decisión sobre qué hacer cuando el
  precio no está disponible.
- **Un límite distinto por activo en la configuración.** Más preciso, pero
  multiplica los campos del formulario de límites justo cuando la UI tiene que
  ser simple de entender.

## Consecuencias

⚠️ Con un XLM a un precio muy distinto del de USDC, el mismo límite numérico
protege de forma desigual. Para testnet es irrelevante; **antes de mainnet hay
que revisarlo** (§15).

Hay que confirmar con el equipo si los valores por defecto de §8.1 se leen como
"unidades del activo" o si se quiere fijar un activo de referencia.

---

## Epílogo

Esta decisión se tomó como _asumida_ y su propio apartado de consecuencias
señalaba el problema: con un XLM a un precio muy distinto del de USDC, el mismo
límite numérico protege de forma desigual.

El [ADR 0011](0011-precios-en-dolares.md) lo cierra añadiendo topes en dólares
que conviven con los límites por activo. Los límites por activo **siguen
existiendo** y siguen aplicándose: lo que cambia es que ya no son la única
barrera.
