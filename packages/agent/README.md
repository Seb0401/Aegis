# @aegis/agent

**Dueño: AI** (ver `.github/CODEOWNERS`).

El agente conversa con el usuario, consulta datos a través de `AgentTools` y
produce **propuestas** válidas. Nunca decide si algo se autoriza: eso es del
Policy Engine. Nunca escribe direcciones Stellar: solo `destinationId`.

## Estado actual

Hay un **agente de reglas** (`createRuleBasedAgent`) que no usa ningún LLM.
Entiende un puñado de frases y sirve para que la API y el frontend ejerciten el
flujo completo desde el día uno. Es un sustituto temporal: la implementación con
_tool calling_ es el trabajo de AI (tareas AI-01 a AI-10 del `PLAN.md`).

Contrato que la implementación real debe cumplir:

```ts
interface Agent {
  handleMessage(input: AgentTurnInput): Promise<AgentTurnResult>;
}
```

Mientras tanto, la API puede cambiar de uno a otro sin tocar nada más.

## Reglas que no se negocian

1. La salida del modelo se valida con `ProposalInputSchema` antes de tocar nada.
2. La suma de las acciones nunca supera el monto que pidió el usuario (AI-05).
3. Todo lo que viene del usuario o de la cadena (memos, etiquetas de objetivos)
   es **texto no confiable** dentro del prompt (§12).
4. El explicador parte de `buildTemplateExplanation` del Guardian: el LLM
   reescribe, no añade cifras (AI-Q5).

## Preguntas abiertas para AI

`AI-Q1` (proveedor y lenguaje), `AI-Q2` (SDK o bucle propio), `AI-Q3` (memoria),
`AI-Q4` (dataset de evaluación), `AI-Q5` (explicaciones), `AI-Q6` (qué datos se
pueden enviar al modelo). Ver §14.3 del `PLAN.md`.
