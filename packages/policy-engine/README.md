# @aegis/policy-engine

**Dueño: BE2.**

Decide si una propuesta se ejecuta sola, necesita al usuario o se rechaza. Es
una **función pura y síncrona**: no consulta la red, no lee la base de datos y
no llama a ningún modelo. La misma entrada siempre da la misma salida.

```ts
import { evaluatePolicy } from '@aegis/policy-engine';

const decision = evaluatePolicy({
  config,
  actions,
  destinations,
  balances,
  dailySpentByAsset,
  operationsLastHour,
  knownCounterparties,
  now,
});
// → { decision: 'REQUIRE_USER', reasons: [...], evaluatedAt: '...' }
```

## Reglas

| ID   | Regla                                  | Efecto al incumplirse               |
| ---- | -------------------------------------- | ----------------------------------- |
| P-01 | Monto máximo por operación             | `REQUIRE_USER`                      |
| P-02 | Límite diario acumulado                | `REQUIRE_USER`                      |
| P-03 | Destino nuevo, desconocido o bloqueado | `REQUIRE_USER` / `DENY`             |
| P-04 | Activos permitidos                     | `DENY`                              |
| P-05 | Máximo de operaciones por hora         | `REQUIRE_USER`                      |
| P-06 | Fondos y reserva mínima intocable      | `DENY`                              |
| P-07 | Modo `MANUAL`                          | `REQUIRE_USER`                      |
| P-08 | Kill switch                            | `DENY` (corta y no evalúa nada más) |
| P-09 | Propuesta caducada                     | `DENY`                              |

El criterio para elegir entre `DENY` y `REQUIRE_USER` está razonado en
[ADR 0005](../../docs/adr/0005-deny-vs-require-user.md).

## Dos unidades, dos barreras

P-01, P-02 y P-06 se comprueban dos veces: contra el límite del propio activo y
contra el tope en dólares. Se queda **la más restrictiva**, así que añadir
precios nunca puede aflojar un límite que ya existía. Cada razón lleva un campo
`unit` (`asset` o `usd`) para que el frontend pueda distinguirlas.

Poner un tope en dólares a `null` lo desactiva y deja solo el del activo.

Si falta el precio de algún activo de la propuesta, **no se evalúa ninguna regla
en dólares** y salta P-10. El razonamiento está en
[ADR 0011](../../docs/adr/0011-precios-en-dolares.md), que sustituye al
[ADR 0003](../../docs/adr/0003-limites-por-activo.md).

## Dos detalles de diseño

- **Recoge todas las razones**, no corta en la primera. El usuario merece ver de
  una vez todo lo que está mal.
- **La decisión final es la más restrictiva** de todas las razones acumuladas.

## Tests

`pnpm test` — 30 casos, incluido el ejemplo de referencia del PLAN ("$50 entre
3 objetivos + $10 de emergencia").
