# Registro de decisiones de arquitectura (ADR)

Un archivo por decisión, numerado. Formato: contexto, decisión, alternativas,
consecuencias, fecha y quién decidió (§14.4 del `PLAN.md`).

Las decisiones marcadas como **asumida** se tomaron sin respuesta del rol
afectado, siguiendo la regla de las 24 h del protocolo de preguntas. Cualquiera
puede revertirlas: se abre un ADR nuevo que sustituya al anterior, no se edita
el viejo.

| #                                                | Decisión                                                  | Estado                   |
| ------------------------------------------------ | --------------------------------------------------------- | ------------------------ |
| [0001](0001-nombre-y-licencia.md)                | Nombre del proyecto y licencia                            | Aceptada                 |
| [0002](0002-stack-backend.md)                    | Fastify + Drizzle + PostgreSQL                            | Aceptada                 |
| [0003](0003-limites-por-activo.md)               | Los límites se aplican por activo, sin conversión         | Sustituida               |
| [0004](0004-auditoria-encadenada.md)             | Auditoría append-only con hash encadenado                 | Aceptada                 |
| [0005](0005-deny-vs-require-user.md)             | Cuándo el Policy Engine deniega y cuándo escala           | Aceptada                 |
| [0006](0006-degradacion-por-riesgo.md)           | Solo el riesgo LOW se ejecuta de forma autónoma           | Aceptada                 |
| [0007](0007-saneado-texto-libre.md)              | Saneado del texto libre y edición de destinos             | Aceptada                 |
| [0008](0008-barrido-de-propuestas.md)            | Barrido de propuestas; SIGNED y SUBMITTED no se tocan     | Aceptada                 |
| [0009](0009-agente-llm-y-evaluaciones.md)        | OpenAI y límites del agente LLM                           | Sustituida               |
| [0010](0010-gateway-y-evaluacion-jev.md)         | Gateway multimodelo y evaluación con JEv                  | Sustituida temporalmente |
| [0011](0011-precios-en-dolares.md)               | Precios en dólares; cierra el agujero del ADR 0003        | Aceptada                 |
| [0012](0012-hackathon-track-agentes.md)          | Hackathon de Stellar, track Agentes y el problema en Perú | Aceptada                 |
| [0013](0013-custodia-del-signer.md)              | Custodia y rotación de la clave del signer                | **Asumida**              |
| [0014](0014-casos-humanos-evaluacion-ai.md)      | Casos humanos anonimizados para evals de AI               | Aceptada                 |
| [0015](0015-groq-directo-y-evaluacion-laya.md)  | Groq directo y evaluación Laya local                      | Aceptada temporalmente   |
