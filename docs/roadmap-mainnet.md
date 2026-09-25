# Roadmap a mainnet

Aegis funciona en **testnet** y esa decisión (D-02) no es provisional por
pereza: hay cosas concretas que hoy no están y que en mainnet significan dinero
de alguien. Este documento las lista sin suavizarlas.

Es la última pieza de ALL-05. No es un plan con fechas: es la lista de lo que
tiene que ser verdad **antes** de que la primera persona ponga dinero real.

---

## Bloqueantes

Sin esto, mainnet no. No es negociable.

### 1. La clave del agente no puede vivir en una variable de entorno

Hoy vive ahí, y el [ADR 0013](adr/0013-custodia-del-signer.md) lo dice sin
adornos: **quien pueda leer el entorno del proceso puede firmar como el
agente**. En testnet eso cuesta XLM de juguete; en mainnet cuesta el dinero de
alguien.

Qué hace falta: KMS o HSM, de forma que el proceso pueda _pedir firmas_ pero
nunca tener la clave en memoria, y que cada uso deje rastro.

### 2. Los límites siguen aplicándose fuera de la cadena

El `PLAN.md` lo confiesa en §4.4. Si la clave se filtra, la red dejaría firmar
cualquier importe: los topes de Aegis no existen para Stellar.

Dos caminos, analizados en el [ADR 0014](adr/0014-x402-y-soroban.md):

- **Smart account de Soroban** con una política de límite on-chain. Es la
  respuesta de verdad. Hoy el SDK es experimental y sin auditoría independiente.
- **Cuenta-bolsillo** con presupuesto acotado (el spike `SP-1` del PLAN). Menos
  elegante y mucho más barato: el daño máximo es el saldo del bolsillo.

Para una primera mainnet, el bolsillo puede bastar. Lo que no puede es no haber
ninguno de los dos.

### 3. Revisión de seguridad por alguien que no seamos nosotros

Quien escribe el código es la peor persona para auditarlo. Mínimo: el flujo de
firma, el manejo de la clave y la superficie del servidor MCP.

### 4. Precios de una fuente de la que se responda

Hoy es CoinGecko, sin acuerdo de servicio y sin contrato. Un precio equivocado
mueve un límite, y un límite equivocado mueve dinero. Para mainnet: una fuente
con compromiso, o un oráculo on-chain (Reflector), y varias fuentes que se
contrasten entre sí.

El puerto `PriceProvider` está pensado para que esto sea una implementación
más.

### 5. Cerrar las puertas de desarrollo y comprobarlo

`ALLOW_DEV_LOGIN` y `USE_FAKE_STELLAR` ya no arrancan con `NODE_ENV=production`,
pero conviene un test que lo verifique contra el despliegue real y no solo
contra el esquema.

---

## Necesario, no bloqueante

- **Observabilidad de verdad** (`BE2-Q5`, abierta). Hoy: id por petición, logs
  redactados y `/health` con sonda de base de datos. Falta saber, sin entrar a
  la máquina, cuántas propuestas se deniegan y por qué regla.
- **Umbrales del Guardian con datos reales** (`BE2-Q3`). Los pesos de las
  señales son provisionales y nadie los ha contrastado con comportamiento real.
- **Límites por usuario, no globales.** Hoy hay un signer global (ADR 0013). El
  radio de daño de una filtración es "todas las cuentas" en vez de "una".

---

## Legal y de producto

Nada de esto es código, y todo puede parar un lanzamiento:

- Términos de uso que digan **qué pasa si el agente se equivoca** y quién
  responde. Es la pregunta que hará la primera persona que pierda dinero.
- Requisitos de KYC/AML según dónde opere. Perú tiene sus propias normas para
  proveedores de servicios de activos virtuales.
- Política de datos: qué se guarda, cuánto y qué se envía al proveedor del LLM
  (`AI-Q6`, abierta).
- Un canal de soporte. Un producto que mueve dinero sin forma de reclamar no es
  un producto.

---

## Lo que ya está listo para mainnet

No todo hay que rehacerlo. Lo siguiente se diseñó pensando en esto:

- **Aritmética de dinero con enteros**, nunca coma flotante.
- **Auditoría append-only con hash encadenado**, verificación de integridad y
  un cerrojo por usuario que impide que la cadena se bifurque bajo carga.
- **Motores deterministas**: ni el Policy Engine ni el Guardian llaman a un LLM,
  así que una decisión de autorización es reproducible y explicable.
- **El agente nunca escribe direcciones**: solo referencia destinos registrados.
- **Kill switch** que corta antes de evaluar nada más.
- **Saneado del texto libre** y validación de esquema en toda entrada.
- **Transiciones de estado atómicas**, condicionadas al estado esperado.
- **Ningún pago se da por fallido sin preguntarle al ledger.** El hash se
  calcula y se guarda antes de enviar, así que un envío que se queda sin
  respuesta queda en `SUBMITTED` con por dónde preguntar, y lo resuelve el
  barrido.

---

## El orden que seguiría

1. Cuenta-bolsillo (`SP-1`) — acota el daño máximo con poco trabajo
2. KMS para la clave
3. Revisión de seguridad externa
4. Fuente de precios con compromiso
5. Observabilidad
6. Legal, en paralelo desde el principio porque tarda más de lo que parece

Lo primero no es lo más impresionante: es lo que hace que un fallo en cualquiera
de los demás no se lleve por delante el dinero de nadie.
