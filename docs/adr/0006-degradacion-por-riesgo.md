# 0006 · Solo el riesgo LOW se ejecuta de forma autónoma

- **Fecha:** 2026-09-19
- **Estado:** Aceptada
- **Decide:** BE2

## Contexto

El `PLAN.md` (§4.3) dice que el Guardian corre siempre y que "si el riesgo es
`MEDIUM` o superior, una operación que iba a ser autónoma se degrada a
`PENDING_USER`". Había que fijar dónde vive esa regla y cómo se prueba.

## Decisión

La regla vive en una función pura, `decideNextStatus(policyDecision, riskReport)`,
dentro de `apps/api/src/services/proposal-service.ts`:

```
AUTO_APPROVE + LOW              → AUTO_APPROVED
AUTO_APPROVE + MEDIUM|HIGH|CRIT → PENDING_USER
REQUIRE_USER + cualquiera       → PENDING_USER
```

Además, el Guardian se ejecuta **también** cuando la política ya aprobó sola. No
es un paso opcional del camino rápido: es la razón por la que "modo autónomo" no
significa "barra libre".

## Alternativas

- **Permitir autonomía hasta `MEDIUM`.** Más cómodo, pero `MEDIUM` ya incluye
  cosas como "esta operación es el 60 % de tu saldo", que es exactamente lo que
  el usuario querría revisar.
- **Dejar el umbral configurable por el usuario.** Buena idea más adelante;
  ahora añade una perilla más a un producto cuyo valor es ser fácil de confiar.

## Consecuencias

- La regla se puede probar sin base de datos ni red, y así está probada.
- Con los umbrales actuales, una sola señal `HIGH` (peso 35) ya supera el umbral
  de `MEDIUM` (30) y fuerza la confirmación. Es deliberado y conservador; los
  pesos son provisionales (`BE2-Q3`).
