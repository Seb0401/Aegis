# 0009 · Proveedor, modelo y límites del agente LLM

- **Fecha:** 2026-09-22
- **Estado:** Aceptada
- **Decide:** AI

## Contexto

El agente necesitaba interpretar intención y llamar herramientas sin trasladar
decisiones de autorización al modelo. También había que poder probarlo sin
credenciales, acotar fallos y medir calidad, costo y latencia.

## Decisión

- Usar TypeScript con Vercel AI SDK y el proveedor OpenAI.
- Modelo primario: `gpt-6-sol`; fallback: `gpt-6-luna`, condicionado a superar
  el mismo dataset de evals. Ambos nombres y el timeout son configurables.
- Usar tools del SDK con esquemas Zod, un máximo de cinco pasos y un timeout
  de 15 segundos. Si falla el proveedor secundario, degradar al agente de reglas.
- El modelo recibe turnos recientes, saldos solo cuando los consulta y destinos
  con ID, tipo y etiqueta. Nunca recibe direcciones, historial de transacciones,
  claves ni información de firma.
- No hay memoria de hábitos o preferencias en el MVP: solo se usa el contexto
  acotado a los 12 mensajes previos de la conversación activa.
- Las propuestas se validan determinísticamente: presupuesto explícito, saldo
  disponible, activo único, IDs registrados y destinos no bloqueados. El resumen
  y las etiquetas se generan desde datos validados, no desde texto libre del LLM.
- Las explicaciones parten de la plantilla del Guardian; cifras no presentes en
  ella activan el fallback.

## Alternativas

- SDK oficial del proveedor: menor abstracción, pero acopla el agente a una API
  y a su formato de tool calling.
- LangGraph: aporta estado y orquestación más amplios que los necesarios para
  este flujo acotado.
- Un bucle propio: evita una dependencia, pero duplica manejo de llamadas,
  validación, resultados y límites de iteración ya provistos por el SDK.
- Modelo solo económico: menor costo, pero se conserva un modelo de respaldo
  únicamente si alcanza el umbral de evals.

## Consecuencias

- `Agent` sigue siendo el puerto estable; `createRuleBasedAgent` y
  `createFakeAgentTools` permiten tests y desarrollo sin acceso externo.
- `OPENAI_API_KEY` es opcional para desarrollo: sin ella, se usa el agente de
  reglas. La evaluación en vivo requiere una clave y ejecuta 35 casos sintéticos.
- Las métricas registran modelo, tokens, costo estimado, latencia y fallback sin
  guardar prompts ni datos de usuario.

## Fuentes

- [OpenAI model catalog](https://platform.openai.com/docs/models)
- [Vercel AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
