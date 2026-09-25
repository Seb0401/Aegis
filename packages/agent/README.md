# @aegis/agent

**Dueño: AI** (ver `.github/CODEOWNERS`).

El agente conversa con el usuario, consulta datos a través de `AgentTools` y
produce **propuestas** válidas. Nunca decide si algo se autoriza: eso es del
Policy Engine. Nunca escribe direcciones Stellar: solo `destinationId`.

## Inicio rápido

Configura `GROQ_API_KEY` y, opcionalmente, `AGENT_MODEL`,
`AGENT_FALLBACK_MODEL` y `AGENT_TIMEOUT_MS`. El modelo principal por defecto es
`openai/gpt-oss-20b`; el fallback es `openai/gpt-oss-120b`, ambos llamados
directamente en Groq Cloud. Sin la clave, la API usa el agente determinista
`createRuleBasedAgent`.

La integración usa Vercel AI SDK con el proveedor Groq directo, sin depender de
Vercel AI Gateway. La API conserva `Agent` como puerto para que los tests puedan
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
- JEv está temporalmente desactivado: Vercel requiere un método de pago y aún no
  hay acceso a una cuenta TypeSafe. La evaluación temporal usa controles
  deterministas, con una pasada opcional de Laya local y revisión humana.

## Contrato del agente

```ts
interface Agent {
  handleMessage(input: AgentTurnInput): Promise<AgentTurnResult>;
}
```

`createAiAgent` recibe modelos AI SDK por inyección; `createGroqAgent` arma los
modelos elegidos desde la configuración del backend. `createFakeAgentTools`
provee datos sintéticos en memoria para pruebas y evals.

## Pruebas y evals

```sh
pnpm --filter @aegis/agent test
pnpm --filter @aegis/agent eval
python -m pip install laya
python packages/agent/src/evals/laya_review.py --input .ai-agent-eval-results.jsonl
```

La evaluación carga `GROQ_API_KEY` desde el `.env` local o desde el entorno del
proceso. Compara GPT-OSS 20B y GPT-OSS 120B con checks deterministas sobre 35
casos sintéticos y 30 casos humanos anonimizados, cuyo registro editable está en
[`docs/evals/ai-q4-cases.txt`](../../docs/evals/ai-q4-cases.txt). Guarda las
respuestas en `.ai-agent-eval-results.jsonl` para revisión manual. El paso
opcional de Laya carga `laya-multilingual` localmente (sin una API key) y añade
probabilidades de intención/seguridad y una puntuación de calidad a
`.ai-agent-eval-results-laya.jsonl`. Su primer uso descarga los pesos de
Hugging Face y necesita Python 3.10 o superior. Laya es un juez auxiliar, no una
fuente de verdad ni un autorizador financiero. Si se pasa más de un reporte,
Laya combina los casos y el archivo posterior reemplaza duplicados del mismo
modelo/caso. JEv podrá reincorporarse cuando haya acceso a TypeSafe o Vercel AI
Gateway.
