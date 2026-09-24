# @aegis/agent

**Dueño: AI** (ver `.github/CODEOWNERS`).

El agente conversa con el usuario, consulta datos a través de `AgentTools` y
produce **propuestas** válidas. Nunca decide si algo se autoriza: eso es del
Policy Engine. Nunca escribe direcciones Stellar: solo `destinationId`.

## Inicio rápido

Configura `AI_GATEWAY_API_KEY` y, opcionalmente, `AGENT_MODEL`,
`AGENT_FALLBACK_MODEL`, sus órdenes de proveedor y `AGENT_TIMEOUT_MS`. El modelo
principal por defecto es `google/gemini-3.1-flash-lite`; el fallback es
`openai/gpt-oss-20b` enrutado a Groq. Sin la clave, la API usa el agente
determinista `createRuleBasedAgent`.

La integración usa Vercel AI SDK y Vercel AI Gateway. El ID `openai/gpt-oss-20b`
identifica el modelo de pesos abiertos; la orden de proveedor `groq` determina
dónde se ejecuta. La API conserva `Agent` como puerto para que los tests puedan
inyectar una implementación sin llamar a proveedores externos.

## Seguridad y comportamiento

- El LLM solo propone y explica. Policy Engine y Guardian conservan las
  decisiones de autorización y riesgo.
- Las tools de destinos omiten direcciones Stellar; una propuesta solo acepta
  IDs registrados y no bloqueados.
- Las propuestas se validan con `ProposalInputSchema`; el total se compara con
  el presupuesto detectado en los turnos del usuario usando stroops enteros.
- Si falla el proveedor primario, se intenta el modelo secundario; ante otro
  fallo se usa el agente de reglas. El mismo turno nunca crea dos propuestas.
- El explicador parte de `buildTemplateExplanation`. Cualquier cifra nueva o
  cambiada invalida la reescritura y conserva la plantilla.
- El historial enviado al modelo se limita a 12 mensajes previos y no incluye direcciones,
  transacciones ni claves.
- JEv solo califica las evals sintéticas (intención, seguridad y calidad); nunca
  participa en el pipeline de propuestas ni en decisiones financieras.

## Contrato del agente

```ts
interface Agent {
  handleMessage(input: AgentTurnInput): Promise<AgentTurnResult>;
}
```

`createAiAgent` recibe modelos AI SDK por inyección; `createGatewayAgent` arma
los modelos elegidos desde la configuración del backend. `createFakeAgentTools`
provee datos sintéticos en memoria para pruebas y evals.

## Pruebas y evals

```sh
pnpm --filter @aegis/agent test
AI_GATEWAY_API_KEY=... pnpm --filter @aegis/agent eval
```

El corpus tiene 35 casos sintéticos, con casos multi-turno y adversariales. La
evaluación en vivo compara Gemini y Groq por separado con checks deterministas y
JEv. Requiere una clave de Gateway y falla si no alcanza los umbrales; nunca usa
dinero ni destinos reales. AI-Q4 sigue pendiente de casos reales del equipo.
