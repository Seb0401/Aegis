# 0012 · Hackathon de Stellar, track Agentes, y el problema que resolvemos

- **Fecha:** 2026-09-24
- **Estado:** Aceptada
- **Responde a:** `Q-04` (¿es parte de un hackathon? ¿qué criterios aplican?) y precisa `Q-01`
- **Decide:** el equipo

## Contexto

`Q-04` llevaba abierta desde el kickoff: _"¿Es parte de un hackathon o concurso?
¿Qué criterios de evaluación o requisitos de Stellar aplican?"_. La guía oficial
del evento la responde, y con ella cambian algunas prioridades que hasta ahora
eran apuestas.

## Decisión

### Es un hackathon de Stellar y nuestro track es **Agentes**

La guía marca con ★ dos cosas como propias de nuestro track: el diseño de un
agente con **MCP (Model Context Protocol)** y los **pagos agénticos x402**.

### Entregables obligatorios

| Fase | Entregable                                                                                    |
| ---- | --------------------------------------------------------------------------------------------- |
| 06   | Código en GitHub y **una URL pública** donde se pueda probar                                  |
| 07   | **Video de ~3 minutos**: el problema, la solución y una demo en vivo **corriendo en testnet** |

El video exige demo _en vivo en testnet_. Eso convierte el cableado M2 (la API
hablando con Horizon de verdad, no con el cliente falso) de "queda mejor" a
requisito, y es lo que se ha implementado junto con este ADR.

### El problema, en Perú

La Fase 02 pide un problema real de Perú o Latam. El nuestro:

> **Cobras cuando cobras, y nunca sabes cuánto apartar.** Quien trabaja por su
> cuenta —un desarrollador freelance, una comerciante, quien maneja un taller—
> tiene ingresos irregulares. Cuando entra dinero hay que decidir en caliente
> cuánto va a cada cosa, y el fondo de emergencia siempre es lo último. No es
> falta de disciplina: es que decidir cansa, y se decide justo cuando peor
> momento hay para hacerlo.
>
> **Aegis reparte cada ingreso por ti**, dentro de límites que tú pusiste antes,
> y con una reserva mínima que no se toca ni aunque el agente se equivoque.

Por qué Stellar y no una app de banco: las comisiones son de fracciones de
céntimo, así que repartir un ingreso en cuatro pagos pequeños cuesta
prácticamente nada —en una red cara, el reparto se come el ahorro—; la
liquidación es de segundos; y no hace falta cuenta bancaria ni monto mínimo.

### Qué no cambia

Sigue en pie todo lo decidido: testnet (D-02), el LLM propone y el código
determinista decide, el agente nunca escribe direcciones, y la auditoría
encadenada. El track de agentes no relaja ninguna de esas reglas; las hace más
pertinentes, porque un servidor MCP abierto a otros agentes es exactamente el
escenario donde importan.

## Consecuencias

1. **Se construye el servidor MCP** (`apps/mcp`). Expone Aegis como herramientas
   para cualquier agente compatible, y su decisión de diseño es que **ninguna
   herramienta envía dinero**: la única que escribe crea una propuesta que pasa
   por Policy Engine, Guardian y auditoría, y la aprueba una persona. Un agente
   externo hereda las protecciones del usuario sin implementarlas.
2. **Se cablea M2**: con `USE_FAKE_STELLAR=false` la API lee Horizon de verdad y
   firma y envía transacciones reales en testnet.
3. **Baja de prioridad** el oráculo Reflector y las passkeys: no aparecen en la
   guía y compiten en tiempo con lo obligatorio.
4. **Queda pendiente de investigar** x402 (pagos agénticos), marcado como propio
   del track. No se descarta; no se ha mirado aún.
5. **Queda pendiente confirmar** si el "entregable de evidencia on-chain" que la
   guía menciona de pasada obliga a desplegar un contrato Soroban. De la
   respuesta depende si se hace el trabajo de límites on-chain, que sería la
   respuesta definitiva a la debilidad que el propio `PLAN.md` confiesa en §4.4.

## Trampas de la guía que ya estaban cubiertas

La guía lista seis errores frecuentes. Conviene saber cuáles ya no nos pueden
pasar, porque es material para el video:

| Trampa                             | Estado                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| USDC tiene 7 decimales, no 6       | Cubierto: todo el dinero se maneja con enteros escalados en `money.ts`, nunca con coma flotante |
| `op_no_trust` (falta trustline)    | Cubierto: la señal G-05 y la simulación previa lo detectan **antes** de pedir la firma          |
| `tx_too_late`                      | Cubierto: `STELLAR_TRANSACTION_TIMEOUT_SECONDS=180` por defecto                                 |
| `tx_bad_seq`                       | Cubierto: el ejecutor carga la cuenta justo antes de construir cada transacción                 |
| Simular antes de enviar en Soroban | No aplica todavía: no usamos Soroban                                                            |
| Reset trimestral de testnet        | **Pendiente**: hay que verificar la cuenta demo antes de grabar el video                        |
