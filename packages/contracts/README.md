# @aegis/contracts

**Dueño: compartido.** Cambios con **2 aprobaciones** (productor y consumidor).

Es lo único que los cuatro roles comparten. Todo lo demás depende de aquí y nada
de aquí depende de nadie.

## Qué hay

| Archivo          | Contenido                                                     |
| ---------------- | ------------------------------------------------------------- |
| `common.ts`      | Montos, direcciones, activos, saldos, historial, error de API |
| `destination.ts` | Objetivos, contactos y fondo de emergencia                    |
| `policy.ts`      | `PolicyConfig` (P-01…P-09), decisión y resumen                |
| `risk.ts`        | Señales G-01…G-09, `RiskReport`, `Explanation`, umbrales      |
| `proposal.ts`    | `Proposal`, estados, **tabla de transiciones**, auditoría     |
| `ports.ts`       | `StellarReader`, `StellarExecutor`, `AgentTools`              |
| `api.ts`         | Petición y respuesta de cada endpoint de §5.2                 |
| `money.ts`       | Aritmética decimal con BigInt                                 |
| `fixtures/`      | Datos de ejemplo para FE, AI y tests                          |

## La regla del dinero

Los montos son **strings decimales**, nunca `number`. `money.ts` los suma,
resta y compara con BigInt en stroops (10⁻⁷).

```ts
addAmounts('0.1', '0.2'); // '0.3000000', no 0.30000000000000004
```

Usar `Number` para sumar saldos parece inofensivo hasta que un error de redondeo
se convierte en una decisión de autorización equivocada.

## Fixtures

Las direcciones de `fixtures/` son claves públicas **válidas** (formato y
checksum correctos) generadas de forma determinista, pero nadie tiene su clave
privada. Sirven para mocks, no para mover dinero.

## Cómo se cambia

1. Issue con la etiqueta `contract-change`.
2. PR con 2 aprobaciones.
3. Cambios aditivos libres hasta el **contract freeze** (final de S2); después,
   solo con justificación y aviso al equipo (§5.4 del `PLAN.md`).
