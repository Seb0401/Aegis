# 0011 · Precios en dólares y topes en una unidad común

- **Fecha:** 2026-09-24
- **Estado:** Aceptada
- **Sustituye a:** [ADR 0003](0003-limites-por-activo.md), que estaba marcado como _asumido_
- **Decide:** BE2
- **Toca `packages/contracts`:** sí, de forma **aditiva** → necesita 2 aprobaciones (§5.4)

## Contexto

El `PLAN.md` escribe las reglas en dólares: "máx. $5 por operación", "límite
diario $20", "reserva mínima $10". Pero el sistema mueve `XLM` y `USDC_TEST`,
que no valen lo mismo. El ADR 0003 zanjó esto comparando el número contra el
monto del activo sin convertir, y lo dejó escrito como un problema conocido:

> Con un XLM a un precio muy distinto del de USDC, el mismo límite numérico
> protege de forma desigual.

En la práctica el agujero es grande. Con un límite de 5, enviar 5 USDC son unos
5 dólares, pero enviar 5 XLM son unos 60 céntimos. El mismo límite deja pasar
diez veces menos valor en un caso que en el otro, y el usuario no tiene forma de
saberlo. Era la decisión con más riesgo del proyecto.

## Decisión

**Precios en dólares, inyectados como dato, con topes que conviven con los
existentes.**

### De dónde salen los precios

Un paquete nuevo, `@aegis/prices`, detrás del puerto `PriceProvider` que vive en
el contrato. Tres piezas que se componen:

- `MarketPriceProvider` consulta la API pública de CoinGecko. Sin clave, con
  tiempo máximo de espera propio.
- `FixedPriceProvider` sirve tasas de configuración. Es lo que da precio a
  `USDC_TEST`, que emitimos nosotros en testnet y no cotiza en ningún sitio.
- `CachedPriceProvider` cachea por activo y, si el proveedor falla, sigue
  sirviendo el último precio conocido dentro de una ventana de gracia. El `asOf`
  de cada precio delata su edad: nadie finge que un dato viejo sea fresco.

`PRICE_SOURCE=fixed` desconecta la red por completo. Es lo que usan los tests y
lo que permite una demo que no dependa de que un tercero esté en pie.

### Cómo se aplican

Los topes en dólares (`maxAmountPerOperationUsd`, `maxDailyAmountUsd`,
`minimumReserveUsd`) **se suman a** los límites por activo en vez de
sustituirlos, y se queda el más restrictivo de los dos. Añadir precios nunca
puede aflojar un límite que ya existía.

`null` en cualquiera de ellos desactiva ese tope y deja solo el del activo.

Las razones de la política llevan un campo `unit` (`asset` o `usd`): sin él, el
frontend no podría distinguir "excede tu límite de 5 USDC" de "excede tu límite
de $5", que son la misma regla pero dos barreras distintas.

### Qué pasa cuando no hay precio

**Se escala al usuario.** Regla nueva **P-10** con efecto `REQUIRE_USER` y señal
nueva **G-10** en el Guardian.

Las alternativas eran peores en ambos sentidos. Denegar dejaría el producto
inutilizable por una caída de CoinGecko, y el usuario no podría hacer nada al
respecto. Caer en silencio a los límites por activo reabriría este mismo agujero
sin que nadie se entere, que es exactamente lo que hace daño.

Dos detalles que evitan avisos inútiles:

- P-10 y G-10 solo saltan si hay **algún tope en dólares configurado**. Sin
  ellos, no saber el precio no impide comprobar nada, y una advertencia que no
  cambia ninguna decisión solo enseña a ignorar las advertencias.
- Sin precio no se evalúa **ninguna** regla en dólares. Ninguna conversión se
  hace a ciegas.

### Los motores siguen siendo puros

El Policy Engine y el Guardian **reciben** la foto de precios, no la consultan.
Si pidieran el precio por su cuenta dejarían de ser deterministas, y los mismos
datos podrían dar decisiones distintas en dos ejecuciones seguidas.

### La foto se guarda con la propuesta

Columna `prices` en `proposals`, y las cotizaciones usadas también en el evento
de auditoría `POLICY_EVALUATED`. Para explicar dentro de un mes por qué una
operación se aprobó hace falta el precio de entonces, no el de hoy.

Por el mismo motivo, el acumulado diario en dólares valora cada propuesta con
**su propia** foto: si XLM se dobla de precio por la tarde, lo que gastaste por
la mañana no pasa a contar el doble contra tu límite.

## Alternativas

- **Oráculo nativo de Stellar (Reflector, sobre Soroban).** Encaja mejor con el
  ecosistema y el dato es verificable on-chain. Descartado por ahora porque mete
  Soroban en el MVP, que el `PLAN.md` deja fuera en §15. El puerto
  `PriceProvider` está pensado para que cambiar a esto después sea una
  implementación más, sin tocar reglas ni orquestador.
- **Reinterpretar los límites actuales como dólares.** Más limpio: una sola
  perilla por regla, y coincide con lo que el PLAN dice desde el principio. Se
  descartó porque cambia el significado de las configuraciones ya guardadas y
  exige una migración de datos, mientras que conviviendo no se rompe nada.
- **Mostrar los dólares solo en la interfaz.** El cambio más pequeño, pero no
  cierra el agujero: las reglas seguirían comparando por activo.

## Consecuencias

- ⚠️ Los valores por defecto de los topes en dólares son `$5`, `$20` y `$10`,
  siguiendo §8.1 leído como dólares. Eso significa que **por defecto toda
  propuesta necesita precio**, y una caída del oráculo hace que todo escale al
  usuario en vez de ejecutarse solo. Es el lado seguro del error, pero conviene
  saberlo antes de la demo.
- CoinGecko es una dependencia externa nueva en el camino crítico de crear una
  propuesta. Mitigado con tiempo máximo de espera, caché y ventana de gracia.
- Los tests que fijan límites para aislar una regla ahora tienen que fijar
  también el tope en dólares, o el que no esperaban será el que ate.
- Queda pendiente decidir con el equipo si la pantalla de límites (FE-09) enseña
  las dos unidades o solo la de dólares con la del activo en "avanzado".
