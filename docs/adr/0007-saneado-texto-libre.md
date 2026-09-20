# 0007 · Saneado del texto libre y edición de destinos

- **Fecha:** 2026-09-20
- **Estado:** Aceptada
- **Decide:** BE2
- **Toca `packages/contracts`:** sí, de forma **aditiva** → necesita 2 aprobaciones (§5.4)

## Contexto

Dos problemas relacionados, encontrados al escribir los tests de integración.

**Uno.** `memo` y `label` son texto libre que el agente propone y que acaba en
tres sitios distintos: la base de datos, la pantalla del usuario y el prompt del
modelo. No había ningún saneado. No es inyección SQL (Drizzle parametriza), pero
sí abre la puerta a:

- caracteres de control, que rompen logs y terminales;
- espacios de ancho cero, que permiten dos etiquetas visualmente idénticas pero
  distintas: el usuario cree aprobar un pago a "Viaje" y aprueba otro;
- marcas de anulación bidireccional (RLO/LRO), que invierten el orden visual del
  texto, así que lo que se lee no es lo que dice.

**Dos.** `Destination.blocked` y `Destination.trusted` existen en el contrato y
los usan P-03 y G-09… pero **no había ninguna forma de ponerlos**. El usuario no
podía bloquear un destino ni marcarlo de confianza. Una regla que nadie puede
activar no protege de nada.

## Decisión

**Saneado en el contrato, solo en los esquemas de entrada.** `sanitizeText`
elimina caracteres de control e invisibles, colapsa espacios y recorta. Se aplica
a `ProposalInputSchema` (resumen, memos, etiquetas) y a
`CreateDestinationInputSchema`.

Los esquemas de **salida** se quedan sin `transform`: lo que devuelven ya entró
limpio, y así el OpenAPI generado no arrastra `ZodEffects`.

**`PATCH /destinations/:id`** permite renombrar, marcar como de confianza y
bloquear. La **dirección no se puede editar**: cambiarla convertiría "marqué este
destino como de confianza" en un cheque en blanco hacia otra cuenta. Para enviar
a otra dirección se registra un destino nuevo, que vuelve a pasar por P-03.

Ambos cambios de `trusted` y `blocked` quedan en la bitácora con el valor
anterior y el nuevo, porque los dos cambian el comportamiento del sistema.

## Alternativas

- **Sanear solo en la capa de la API.** No habría necesitado aprobaciones, pero
  el contrato seguiría admitiendo basura y el frontend y el agente tendrían que
  defenderse por su cuenta. La protección debe estar donde está la definición.
- **Escapar al mostrar, en vez de sanear al guardar.** Resuelve la pantalla pero
  no el prompt del modelo ni los logs, y depende de que FE se acuerde siempre.
- **Permitir editar la dirección de un destino.** Cómodo y peligroso: ver arriba.

## Consecuencias

- Una etiqueta que se queda vacía tras sanear se rechaza con 400, en vez de
  guardarse como cadena vacía.
- `CreateDestinationRequest` (el tipo de entrada, con `trusted` opcional) se
  añade al contrato para que quien construye la petición no tenga que rellenar
  los valores por defecto.
- Registrar dos veces la misma dirección ahora devuelve **409
  `DESTINATION_ALREADY_EXISTS`** en vez de un 500 indistinguible de una caída.
- FE-10 (pantalla de objetivos y contactos) ya tiene el endpoint que necesitaba.
