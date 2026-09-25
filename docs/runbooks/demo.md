# Runbook · la demo y el video

Entregable de la Fase 07: un video de ~3 minutos con el problema, la solución y
una **demo en vivo corriendo en testnet**.

Esto no es un guion para leer en voz alta. Es la lista de lo que hay que
enseñar, en qué orden y por qué cada cosa está ahí.

---

## Antes de grabar

- [ ] La cuenta demo existe en [Stellar Expert testnet](https://stellar.expert/explorer/testnet)
      — **testnet se reinicia cada ~3 meses**
- [ ] Tiene saldo de sobra para los pagos del guion
- [ ] `curl https://TU-API/health` → `status: ok`, `database: ok`, **`fakeStellar: false`**
- [ ] `PRICE_SOURCE=fixed` en el entorno de la demo, para no depender de CoinGecko
- [ ] Recorrer el flujo entero una vez, de principio a fin
- [ ] Tener abierta una pestaña con Stellar Expert para enseñar la transacción

---

## Estructura (3 minutos)

### 1. El problema · 20 s

> Si trabajas por tu cuenta, cobras cuando cobras. Y cada vez que entra dinero
> tienes que decidir en caliente cuánto va a cada cosa. El fondo de emergencia
> siempre es lo último.

No es un problema de disciplina. Es que decidir cansa, y se decide justo en el
peor momento.

_[En pantalla: nada todavía, o el título]_

### 2. Por qué no basta con "que lo haga una IA" · 25 s

> Un agente podría repartirlo solo. Pero darle acceso a tu dinero da miedo por
> buenas razones: puede equivocarse, puede gastar de más, y puede ser
> manipulado. Hoy la elección es control total o nada.

**Este es el hueco que Aegis ocupa.** Si el video no deja claro este punto, todo
lo demás parece una app de finanzas más.

### 3. La demo · 90 s

El orden importa: primero que funciona, después que es seguro, y al final que
cualquier agente puede usarlo.

**a) Funciona** _(~30 s)_

En el chat: _"reparte 50 entre mis objetivos y guarda 10 para emergencias"_.

Enseñar la propuesta: los cuatro pagos, el valor en dólares, y la explicación en
lenguaje normal. Aprobar. **Abrir Stellar Expert y enseñar la transacción.**

> Eso acaba de pasar en la red Stellar. Cuatro pagos, en un segundo, por
> fracciones de céntimo.

**b) Es seguro** _(~40 s)_

Esta es la parte que diferencia. Dos cosas, sin prisa:

- **Los límites atan.** Pedir algo que se pase del máximo por operación. Enseñar
  que la propuesta queda esperando confirmación y **por qué**, con la regla
  concreta. Señalar que el límite existe en dos unidades: el activo y dólares.
- **El Guardian explica.** Enseñar una propuesta con riesgo: el porcentaje del
  saldo, el saldo que quedaría, la advertencia. Recalcar que esas cifras no las
  escribe el modelo: el modelo solo las redacta.

Si hay tiempo, el **kill switch**: pausar el agente y enseñar que la siguiente
propuesta sale denegada.

**c) Cualquier agente puede usarlo** _(~20 s)_

Abrir Claude Desktop con el servidor MCP conectado y pedirle que proponga un
reparto. Enseñar que la propuesta aparece en Aegis **esperando aprobación**.

> Cualquier agente de IA puede conectarse a Aegis. Ninguno puede enviar dinero:
> heredan tus límites, tu análisis de riesgo y tu auditoría.

### 4. Por qué Stellar · 25 s

> Repartir un ingreso en cuatro pagos cuesta fracciones de céntimo. En una red
> cara, el reparto se comería el ahorro. Liquida en segundos, y no hace falta
> cuenta bancaria ni monto mínimo.

Si queda un segundo: la bitácora, con su cadena de hashes verificable.

### 5. Cierre · 20 s

> Aegis no es un agente con acceso a tu dinero. Es la capa que hace que
> delegárselo a un agente sea razonable.

---

## Lo que NO hay que hacer

- **No enseñar código.** El jurado no lo va a leer y consume el tiempo de lo que
  sí importa.
- **No decir "usamos IA" sin más.** Lo interesante es lo contrario: que el
  modelo propone y explica, y que **ninguna decisión de autorización depende de
  él**. Eso es lo que nadie más va a estar contando.
- **No prometer mainnet.** Es testnet, y decirlo da credibilidad en vez de
  quitarla.
- **No improvisar el flujo.** Ensayarlo entero al menos una vez: la primera
  petición al agente puede tardar unos segundos y en video eso se hace eterno.

---

## Si algo falla en directo

| Falla                           | Qué hacer                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| El agente no responde           | Sin `GROQ_API_KEY` cae al agente de reglas, que entiende "reparte N entre mis objetivos". La demo sigue |
| Todo sale pendiente con `P-10`  | No hay precios. `PRICE_SOURCE=fixed`                                                                    |
| El pago falla con `op_no_trust` | La cuenta destino no admite ese activo. En testnet, usar XLM                                            |
| La cuenta demo no existe        | Testnet se reinició. Rehacer el paso 2 de [`deploy.md`](deploy.md)                                      |

---

## Guion alternativo, si no da tiempo a desplegar

Se puede grabar en local con la API en `localhost` y `USE_FAKE_STELLAR=false`:
las transacciones son reales en testnet igualmente y Stellar Expert las muestra.
Lo único que se pierde es que el jurado lo pruebe por su cuenta, que es la
Fase 06.

**No grabar con `USE_FAKE_STELLAR=true`.** Los hashes serían inventados y no
aparecerían en el explorador. Es exactamente la clase de cosa que un jurado
comprueba.
