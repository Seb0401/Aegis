# 0005 · Cuándo el Policy Engine deniega y cuándo escala al usuario

- **Fecha:** 2026-09-19
- **Estado:** Aceptada
- **Decide:** BE2

## Contexto

El `PLAN.md` define tres decisiones posibles (`AUTO_APPROVE`, `REQUIRE_USER`,
`DENY`) pero no dice qué regla produce cuál. Sin un criterio explícito, cada
regla se habría implementado según la intuición de quien la escribiera.

## Decisión

El criterio es **si el usuario puede arreglarlo pulsando "aprobar"**:

- **`DENY`** cuando aprobar no cambiaría nada o sería claramente dañino:
  kill switch activo (P-08), propuesta caducada (P-09), activo fuera de la lista
  blanca (P-04), destino desconocido o bloqueado (P-03), fondos insuficientes y
  reserva mínima intocable (P-06).
- **`REQUIRE_USER`** cuando la operación simplemente excede lo que el agente
  puede hacer por su cuenta: monto por encima del límite (P-01), límite diario
  (P-02), destino sin historial (P-03), demasiadas operaciones por hora (P-05) y
  modo manual (P-07).

La decisión final es la **más restrictiva** de todas las razones, y el motor
recoge todas las razones en vez de cortar en la primera: el usuario merece ver
todo lo que está mal de una vez.

## Alternativas

- **Denegar cualquier incumplimiento.** Más seguro sobre el papel, pero convierte
  los límites en muros y hace inútil el flujo de confirmación: el producto
  entero es "el agente propone, tú autorizas".
- **Escalar siempre.** Deja pasar cosas que nunca deberían llegar a mostrarse,
  como un pago a un destino que el usuario bloqueó.

## Consecuencias

P-06 (reserva mínima) deniega en vez de escalar, siguiendo la palabra
"intocable" del `PLAN.md`. Si en la práctica resulta demasiado rígido, es el
primer candidato a revisarse.
