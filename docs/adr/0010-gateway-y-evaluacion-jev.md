# 0010 · Gateway multimodelo y evaluación con JEv

- **Fecha:** 2026-09-22
- **Estado:** Aceptada
- **Decide:** AI
- **Sustituye:** [ADR-0009](0009-agente-llm-y-evaluaciones.md) para proveedor y modelo de generación

## Contexto

El primer adaptador usaba directamente la API de OpenAI. El equipo quiere poder
comparar modelos de Google y Groq, evitar credenciales directas de un proveedor
en la aplicación y sumar un juez a las evaluaciones del agente.

## Decisión

- Usar Vercel AI Gateway para el agente y el explicador con una sola
  `AI_GATEWAY_API_KEY`.
- Candidato principal: `google/gemini-3.1-flash-lite`, enrutado a Google.
- Candidato alternativo: `openai/gpt-oss-20b`, enrutado explícitamente al
  proveedor `groq`. El prefijo del ID nombra el modelo; el orden de proveedor
  selecciona Groq para la inferencia.
- Ejecutar el corpus con cada modelo de forma independiente para comparar
  seguridad determinista, latencia, costo estimado y calidad.
- Usar `typesafe-ai/jev` mediante `experimental_evaluate` solo para juzgar la
  intención, la seguridad y la calidad de las respuestas dentro del arnés. JEv
  nunca participa en propuestas reales, autorización ni decisiones del Guardian.
- Si no hay credencial de Gateway en desarrollo, conservar el agente determinista.

## Alternativas

- API directa de Google y Groq: elimina Gateway, pero requiere gestionar
  proveedores/credenciales separados y adapta la configuración a cada SDK.
- JEv como modelo conversacional: no corresponde; es un modelo de evaluación
  tipada, no un generador de respuestas o llamadas a tools.
- Elegir definitivamente un único candidato antes de comparar: reduce trabajo,
  pero no produce evidencia sobre calidad, fallbacks, latencia o costo.

## Consecuencias

- `createAiAgent` sigue recibiendo modelos AI SDK por inyección; el núcleo de
  herramientas y las validaciones deterministas no dependen del proveedor.
- El fallback de producción intenta Groq cuando falla el candidato Google; el
  arnés desactiva ese fallback para medir ambos modelos por separado.
- JEv aporta juicios de calidad no deterministas. Los umbrales financieros y las
  comprobaciones de IDs, montos y activos siguen siendo código determinista.
- El dataset actual tiene 35 casos sintéticos. AI-Q4 sigue requiriendo casos
  reales aportados por el equipo antes de tratar el resultado como validación
  representativa de usuarios.

## Fuentes

- [Vercel AI Gateway: modelos y proveedores](https://vercel.com/docs/ai-gateway/models-and-providers)
- [Gemini 3.1 Flash Lite en Gateway](https://vercel.com/ai-gateway/models/gemini-3.1-flash-lite)
- [JEv en Gateway](https://vercel.com/ai-gateway/models/jev)
- [Vercel AI SDK: evaluaciones](https://ai-sdk.dev/docs/ai-sdk-core/evaluation)
