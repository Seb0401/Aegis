# @aegis/prices

**Dueño: BE2.**

Precio en dólares de los activos, detrás del puerto `PriceProvider` que vive en
`@aegis/contracts`. Existe para cerrar el agujero del
[ADR 0003](../../docs/adr/0003-limites-por-activo.md): las reglas del `PLAN.md`
están escritas en dólares pero el sistema mueve XLM y USDC, que no valen lo
mismo. El razonamiento completo está en el
[ADR 0011](../../docs/adr/0011-precios-en-dolares.md).

```ts
import { createPriceProvider } from '@aegis/prices';
import { toUsd } from '@aegis/contracts';

const prices = createPriceProvider({ source: 'market' });
const snapshot = await prices.getPrices(['XLM', 'USDC_TEST']);

toUsd('100', 'XLM', snapshot); // '12.0000000' — o null si no hay precio
```

## Las piezas

| Clase                   | Qué hace                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `MarketPriceProvider`   | Consulta la API pública de CoinGecko. Sin clave, con tiempo máximo de espera propio          |
| `FixedPriceProvider`    | Tasas de configuración. Es lo que da precio a `USDC_TEST`, que emitimos nosotros y no cotiza |
| `FallbackPriceProvider` | Encadena proveedores: el primero manda y el siguiente solo rellena huecos                    |
| `CachedPriceProvider`   | Caché por activo, con ventana de gracia si el proveedor falla                                |

`createPriceProvider` las compone. En `market`, el precio real de XLM sale del
mercado y el de USDC_TEST de la configuración; en `fixed` no se sale a la red.

## La regla que comparten todas

**Ninguna lanza por un activo sin precio.** Devuelven una foto con lo que tengan
y omiten el resto. Que falte un precio es información, no un error: quien llama
la convierte en algo que el usuario ve (la regla P-10 y la señal G-10). Un
proveedor que lanzara dejaría al usuario con un "algo falló" en vez de un "no sé
cuánto vale esto".

Por el mismo motivo, `toUsd` devuelve `null` sin precio en vez de asumir
paridad. Convertir a ciegas sería peor que no convertir, porque nadie se
enteraría.

## Precios viejos

Cuando el proveedor falla, la caché sigue sirviendo el último valor conocido
dentro de la ventana de gracia. Ese valor conserva su `asOf` original, así que
la interfaz puede distinguir un precio de hace diez segundos de uno de hace
media hora en vez de presentarlos como equivalentes.

## Configuración

| Variable                  | Qué hace                                         |
| ------------------------- | ------------------------------------------------ |
| `PRICE_SOURCE`            | `market` o `fixed`. `fixed` no sale a la red     |
| `PRICE_CACHE_TTL_SECONDS` | Validez de la caché. Por defecto 60              |
| `PRICE_TIMEOUT_MS`        | Espera máxima al mercado. Por defecto 4000       |
| `PRICE_XLM_USD`           | Tasa fija de XLM, solo si el mercado no responde |
| `PRICE_USDC_TEST_USD`     | Precio de `USDC_TEST`. Por defecto 1             |
| `MARKET_PRICE_BASE_URL`   | Para apuntar a un mock en desarrollo             |

## Mañana

El puerto está pensado para que cambiar de fuente sea una implementación más.
Si el equipo quiere un oráculo nativo de Stellar (Reflector, sobre Soroban),
entra aquí sin tocar ni las reglas ni el orquestador. Hoy está fuera porque
metería Soroban en el MVP, que el `PLAN.md` deja para §15.

## Tests

`pnpm test` — 19 casos, sin red: el `fetch` se inyecta.
