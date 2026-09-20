## Qué cambia

<!-- Una o dos frases. Si el PR pasa de 400 líneas, plantéate partirlo (§11). -->

## Por qué

<!-- Enlaza el issue: Closes #NN -->

## Área

- [ ] `area:fe` Frontend
- [ ] `area:be1` Backend Stellar
- [ ] `area:be2` Backend API / políticas / Guardian
- [ ] `area:ai` Agente
- [ ] Transversal

## Checklist (Definition of Done, §11)

- [ ] CI en verde
- [ ] Tests que cubren el cambio
- [ ] Documentación mínima actualizada (README del paquete o ADR)
- [ ] **Sin secretos**: ninguna clave, `.env` ni XDR firmado en el diff
- [ ] Probado contra el mock y, si ya existe, contra la integración real

## ¿Toca `packages/contracts`?

- [ ] No
- [ ] Sí → necesita **2 aprobaciones** (productor y consumidor) y aviso al
      equipo. Si es después del contract freeze, explica por qué (§5.4).

## Cómo probarlo

```bash
# pasos concretos
```
