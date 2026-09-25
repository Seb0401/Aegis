# 0015 · Groq directo y evaluación Laya local

- **Fecha:** 2026-09-25
- **Estado:** Aceptada temporalmente
- **Decide:** AI
- **Sustituye temporalmente:** [ADR-0010](0010-gateway-y-evaluacion-jev.md) para llamadas de generación y evaluación

## Contexto

El proyecto no puede usar JEv por Vercel AI Gateway: la cuenta exige un método
de pago, y todavía no hay acceso a una cuenta TypeSafe. El equipo dispone de una
clave directa de Groq y ya tiene 65 casos de evaluación anonimizados.

## Decisión

- Llamar directamente a Groq Cloud con `GROQ_API_KEY` y el proveedor
  `@ai-sdk/groq`.
- Usar `openai/gpt-oss-20b` como principal y `openai/gpt-oss-120b` como fallback;
  ambos son modelos servidos por Groq. La clave es de Groq, no de OpenAI.
- Ejecutar Gemini/Groq+JEv después, si se habilita el acceso a Gateway/TypeSafe.
- Mientras tanto, evaluar con checks deterministas y guardar respuestas
  anonimizadas en `.ai-agent-eval-results.jsonl`.
- Ofrecer una segunda pasada opcional con Laya `multilingual`, ejecutada localmente
  desde Python, y revisión humana de sus puntuaciones.
- La evaluación no cambia la autorización financiera: políticas y validaciones
  deterministas siguen teniendo la última palabra.

## Alternativas

- Añadir una tarjeta a Vercel AI Gateway: permite seguir con Gemini/Groq/JEv por
  Gateway, pero no es una opción disponible ahora.
- Esperar una cuenta TypeSafe para usar JEv directamente: mantendría la rúbrica
  tipada, pero deja el benchmark bloqueado mientras no llegue esa cuenta.
- Usar GPT-OSS como juez de sí mismo añade sesgo y no equivale a JEv; Laya
  aporta una señal local separada y la revisión humana conserva la última palabra.

## Consecuencias

- La comparación temporal mide GPT-OSS 20B y 120B, no Gemini.
- Laya ejecuta localmente el checkpoint multilingüe; su primer uso descarga los
  pesos desde Hugging Face y requiere Python 3.10 o superior.
- Los 65 casos (35 sintéticos y 30 human-validated) se ejecutan contra fixtures;
  el reporte local contiene prompts anonimizados y está excluido de Git.
- Esta es una configuración temporal. Cuando haya acceso a TypeSafe o Gateway,
  reevaluar la incorporación de JEv como juez, nunca como autorizador.

## Fuentes

- [Groq: modelos disponibles](https://console.groq.com/docs/models)
- [Groq: herramienta directa con AI SDK](https://ai-sdk.dev/providers/ai-sdk-providers/groq)
- [TypeSafe AI SDK: acceso directo a JEv](https://docs.typesafe.ai/sdk/javascript)
