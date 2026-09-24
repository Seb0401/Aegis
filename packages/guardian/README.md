# @aegis/guardian

**Dueño: BE2.**

Calcula las señales de riesgo y el score de una propuesta, y construye la
explicación determinista de la que parte el explicador con LLM.

El Guardian **no autoriza ni bloquea**: produce un informe. Es el orquestador
quien lo usa para degradar una propuesta autónoma a `PENDING_USER`
([ADR 0006](../../docs/adr/0006-degradacion-por-riesgo.md)).

```ts
import { assessRisk, buildTemplateExplanation } from '@aegis/guardian';

const risk = assessRisk({ actions, destinations, balances, config, stats, accountInfoByAddress });
const explanation = buildTemplateExplanation(risk, actions);
```

## Señales

| ID   | Señal                                         | Severidad                                      |
| ---- | --------------------------------------------- | ---------------------------------------------- |
| G-01 | Dirección nunca vista                         | `HIGH`, o `INFO` si el destino es de confianza |
| G-02 | Porcentaje del saldo (≥50 % / ≥70 %)          | `WARN` / `HIGH`                                |
| G-03 | Monto atípico frente a la mediana (≥3× / ≥9×) | `WARN` / `HIGH`                                |
| G-04 | Saldo restante bajo la reserva mínima         | `HIGH`                                         |
| G-05 | Destino sin cuenta o sin trustline            | `HIGH`                                         |
| G-06 | Cuenta destino creada hace menos de 7 días    | `WARN`                                         |
| G-07 | Activo que nunca se ha enviado                | `INFO`                                         |
| G-08 | Velocidad inusual de operaciones              | `WARN`                                         |
| G-09 | Destino en la lista de bloqueo local          | `HIGH`                                         |

**Score:** suma ponderada (`INFO` 0, `WARN` 15, `HIGH` 35), acotada a 100.
**Nivel:** `LOW` <30 · `MEDIUM` 30–59 · `HIGH` 60–84 · `CRITICAL` ≥85.

Los pesos y umbrales son provisionales (`BE2-Q3`).

## El contrato de la explicación

Cada señal deja en `data` las cifras exactas que la sustentan. **Esa es la única
fuente de números para el explicador**: si un dato no está ahí, el LLM no tiene
derecho a mencionarlo. `buildTemplateExplanation` genera el texto solo con esos
valores y es también el camino de respaldo cuando el modelo falla o su salida no
valida (`AI-Q5`).

## Valores en dólares

Cuando hay foto de precios, el informe trae `totalUsd` y `balanceAfterUsd`, y las
señales incluyen el valor en dólares entre sus datos. Si falta el precio, esos
campos son `null` y la clave ni siquiera aparece en `data`: un `null` ahí sería
tentar al explicador a mencionarlo como si fuera una cifra.

G-10 solo salta si el usuario tiene topes en dólares configurados. Sin ellos,
desconocer el precio no impide comprobar nada, y una advertencia que no cambia
ninguna decisión solo enseña a ignorar las advertencias.

## Tests

`pnpm test` — 29 casos, uno por señal más score, niveles y explicación.
