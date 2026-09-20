# 0008 · Barrido de propuestas y qué no se toca sin preguntar a la red

- **Fecha:** 2026-09-20
- **Estado:** Aceptada
- **Decide:** BE2

## Contexto

La caducidad (P-09) solo se aplicaba **cuando alguien leía la propuesta**. Eso
dejaba dos agujeros:

1. Una propuesta en `PENDING_USER` que nadie consultaba seguía viva
   indefinidamente y podía aprobarse horas después de su ventana de 10 minutos.
2. Caducar **no escribía nada en la bitácora**: había un cambio de estado que la
   auditoría no registraba, lo que contradice el principio nº 6.

Además, si el proceso moría entre `POLICY_CHECK` y `GUARDIAN_REVIEW`, la
propuesta se quedaba ahí para siempre: no es un estado terminal y la caducidad
perezosa ni lo miraba.

## Decisión

Un **barrido en el propio proceso de la API** (`ProposalSweeper`), cada minuto:

- `PENDING_USER` y `AUTO_APPROVED` vencidas → `EXPIRED` + evento `PROPOSAL_EXPIRED`.
- `DRAFT`, `POLICY_CHECK` y `GUARDIAN_REVIEW` sin moverse durante 5 minutos →
  `FAILED` + evento `PROPOSAL_ABANDONED`.

Arranca desde `index.ts`, no desde `buildServer`, para que los tests decidan
cuándo corre en vez de pelearse con un temporizador de fondo.

La caducidad perezosa **se mantiene** como red de seguridad para la ventana
entre barridos, y ahora también audita (solo si fue ella quien cambió el estado,
para no duplicar el evento).

### Lo importante: `SIGNED` y `SUBMITTED` no se tocan

El barrido deja fuera esos dos estados **a propósito**. En ambos ya existe una
transacción firmada que puede haber llegado a la red. Marcarla como fallida sin
preguntarle a Stellar sería mentir sobre dinero que quizá se movió, y el usuario
vería "falló" sobre un pago que en realidad se ejecutó.

Reconciliar esos dos estados exige consultar la red y es **BE1-09**. Hasta
entonces se quedan donde están, y hay un test que lo fija para que nadie los
añada al barrido por comodidad.

## Alternativas

- **Un script aparte con cron externo.** Más limpio en cuanto a
  responsabilidades, pero en la demo hay que acordarse de ejecutarlo o nada
  caduca, y añade una pieza de infraestructura que el MVP no tiene.
- **Solo auditar la caducidad perezosa.** Cierra el agujero de la bitácora pero
  deja vivas las propuestas que nadie lee y los estados colgados.

## Consecuencias

- Con varias instancias de la API, todas harían el barrido y duplicarían
  trabajo. Es inofensivo: cada actualización va condicionada al estado que
  esperaba encontrar, así que la segunda no cambia nada. Si alguna vez hay
  varias instancias de verdad, esto se mueve a la cola de trabajos (`BE2-Q2`).
- El intervalo (1 min) y el umbral de abandono (5 min) son constantes en
  `sweeper.ts`. Si el pipeline se vuelve más lento (por ejemplo, al llamar a
  Stellar de verdad), hay que revisar el umbral de 5 minutos.
