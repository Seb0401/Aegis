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
[ADR 0005](../../docs/adr/0005-deny-vs-require-user.md). Los límites se aplican
por activo, sin conversión: [ADR 0003](../../docs/adr/0003-limites-por-activo.md).

## Dos detalles de diseño

- **Recoge todas las razones**, no corta en la primera. El usuario merece ver de
  una vez todo lo que está mal.
- **La decisión final es la más restrictiva** de todas las razones acumuladas.

## Tests

`pnpm test` — 22 casos, incluido el ejemplo de referencia del PLAN ("$50 entre
3 objetivos + $10 de emergencia").
