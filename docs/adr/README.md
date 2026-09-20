# Registro de decisiones de arquitectura (ADR)

Un archivo por decisión, numerado. Formato: contexto, decisión, alternativas,
consecuencias, fecha y quién decidió (§14.4 del `PLAN.md`).

Las decisiones marcadas como **asumida** se tomaron sin respuesta del rol
afectado, siguiendo la regla de las 24 h del protocolo de preguntas. Cualquiera
puede revertirlas: se abre un ADR nuevo que sustituya al anterior, no se edita
el viejo.

| #                                      | Decisión                                          | Estado      |
| -------------------------------------- | ------------------------------------------------- | ----------- |
| [0001](0001-nombre-y-licencia.md)      | Nombre del proyecto y licencia                    | Aceptada    |
| [0002](0002-stack-backend.md)          | Fastify + Drizzle + PostgreSQL                    | Aceptada    |
| [0003](0003-limites-por-activo.md)     | Los límites se aplican por activo, sin conversión | **Asumida** |
| [0004](0004-auditoria-encadenada.md)   | Auditoría append-only con hash encadenado         | Aceptada    |
| [0005](0005-deny-vs-require-user.md)   | Cuándo el Policy Engine deniega y cuándo escala   | Aceptada    |
| [0006](0006-degradacion-por-riesgo.md) | Solo el riesgo LOW se ejecuta de forma autónoma   | Aceptada    |
