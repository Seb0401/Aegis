# 0014 · Casos humanos anonimizados para evals de AI

- **Fecha:** 2026-09-25
- **Estado:** Aceptada
- **Decide:** AI
- **Resuelve:** AI-Q4

## Contexto

AI-Q4 preguntaba quién ayudaría a construir al menos 30 casos reales para
evaluar el agente. El corpus previo tenía 35 casos sintéticos: útiles para
cubrir límites y ataques, pero no para representar cómo las personas formulan
solicitudes.

## Decisión

- Añadir 30 solicitudes revisadas y reescritas por personas del equipo,
  distribuidas entre propuestas, consultas de saldo, aclaraciones, multi-turno
  e inyección adversarial.
- Eliminar o sustituir información identificable antes de enviar los casos a
  los modelos: no se guardan claves, cuentas, transacciones ni direcciones
  reales. Los casos usan saldos y destinos fixture.
- Mantener los 35 casos sintéticos como suite separada; el arnés informa métricas
  para casos humanos aparte.
- Usar expectativas etiquetadas por las personas del equipo como referencia.
  JEv califica las respuestas, pero no decide las etiquetas ni autoriza pagos.

## Consecuencias

- El corpus ejecutable contiene 65 casos: 35 sintéticos y 30 humanos anonimizados.
- El registro editable está en `docs/evals/ai-q4-cases.txt`; los casos humanos se
  marcan `source: human-validated` en `packages/agent/src/evals/dataset.ts`.
- Estos ejemplos son casos de uso redactados por personas, no historiales de
  transacciones en producción. Si el equipo necesitara evidencia de uso real,
  deberá recolectarla con consentimiento y un proceso separado de anonimización.
