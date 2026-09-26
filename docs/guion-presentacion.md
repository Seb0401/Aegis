# Pitch de 3 minutos · estructura y guion

Diez diapositivas. Lo que va `> así` es lo que dices en voz alta; lo demás es
lo que se ve detrás de ti.

**Presupuesto de tiempo:** 354 palabras habladas. A 140 palabras por minuto
—ritmo de conversación, sin correr— son **2 min 31 s**. Aun yendo lento, a 130,
son 2 min 43 s: entra con margen. Lo que sobra es para las pausas y para pasar
de diapositiva. Si aun así vas justo, la 7 se salta entera.

Las capturas están en [`docs/images/`](images/). El runbook de la demo en vivo
es otro documento: [`runbooks/demo.md`](runbooks/demo.md).

---

## La regla de las diapositivas

Nadie puede leer y escucharte a la vez. Si una diapositiva tiene una frase
larga, el jurado la lee y deja de oírte justo cuando dices lo importante.

- **Una idea por diapositiva.** Seis palabras o menos, o una imagen.
- **Nada de código, ni de arquitectura con quince cajas.**
- **Nada de listas de funcionalidades.** Nadie recuerda una lista.

---

## 1 · Portada · 10 s

**En pantalla:** `docs/images/logo.png` centrado sobre fondo oscuro. Debajo, en
pequeño: _Testnet de Stellar_.

> Aegis. Un agente de inteligencia artificial que mueve tu dinero en Stellar,
> dentro de los límites que tú le pones.

---

## 2 · El problema · 25 s

**En pantalla:** solo esta frase, grande — **«El fondo de emergencia siempre es
lo último.»**

> Si trabajas por tu cuenta, cobras cuando cobras. Y cada vez que entra dinero
> tienes que decidir en caliente cuánto va a cada cosa: al alquiler, al curso,
> al fondo de emergencia. El fondo de emergencia siempre es lo último.

> No es falta de disciplina. Es que decidir cansa, y te toca decidir justo en
> el peor momento.

---

## 3 · Por qué no basta con «que lo haga una IA» · 21 s

**En pantalla:** dos palabras enfrentadas — **Control total** ⟷ **Nada**.

> La respuesta obvia es que lo reparta un agente. Y la razón por la que nadie
> lo hace es igual de obvia: darle acceso a tu dinero da miedo. Puede
> equivocarse, puede gastar de más, puede ser manipulado.

> Hoy la elección es control total, o nada.

**Esta es la diapositiva que importa.** Si el jurado no se lleva esta tensión,
todo lo demás parece una aplicación de finanzas más.

---

## 4 · Dónde encaja Aegis · 13 s

**En pantalla:** cuatro cajas en fila, sin adornos:

```
Agente          Policy Engine      Guardian            Stellar
propone    →    tus límites   →    riesgo + explica  →  ejecuta
```

> Aegis es lo que falta en medio. El agente propone. Un motor determinista
> comprueba tus límites. Un Guardian calcula el riesgo y te lo explica. Y recién
> entonces Stellar ejecuta.

---

## 5 · Funciona · 19 s

**En pantalla:** `docs/images/propuesta.png` (el panel con la propuesta y el
análisis del Guardian).

> Le hablo como a una persona: reparte cincuenta entre mis objetivos y guarda
> diez para emergencias. Y responde con una propuesta que todavía no ha hecho
> nada: los cuatro pagos, cuánto vale en dólares, el riesgo, y una explicación
> en lenguaje normal.

---

## 6 · Los límites atan · 20 s

**En pantalla:** `docs/images/limites.png`, o mejor el recuadro del rechazo:

```
P-01: "Objetivo: Viaje" es de 8 XLM
      y tu límite por operación es 5.
```

> Ahora le pido ocho, con el tope por operación en cinco. No lo envía. Se queda
> esperando mi firma, y me dice qué regla lo paró.

> Esa es la diferencia entre un agente con límites y un agente al que se le
> piden límites por favor.

---

## 7 · Quién decide · 12 s _(prescindible si vas justo)_

**En pantalla:** **«El modelo propone. No autoriza.»**

> Y algo importante: esos números no los escribe el modelo. El modelo propone y
> redacta. Quien autoriza es un motor determinista. Una alucinación no puede
> mover dinero.

---

## 8 · Está en la cadena · 16 s

**En pantalla:** la página de la transacción en Stellar Expert, o el hash en
grande:

```
d379a163e28c801977da80e683286624507cadfc8354435e88d199fbd0b2e146
```

> Esto no es una maqueta. Esta transacción está en testnet, ejecutada por Aegis
> de punta a punta. Cuatro pagos por fracciones de céntimo, en segundos.

> En una red cara, el reparto se comería el ahorro.

---

## 9 · Cualquier agente puede usarlo · 13 s

**En pantalla:** Claude Desktop con el servidor MCP conectado, o el logo de
Aegis con varios agentes apuntándole.

> Y Aegis habla MCP, así que cualquier agente de inteligencia artificial puede
> conectarse y proponer. Ninguno puede enviar dinero. Todos heredan tus
> límites, tu Guardian y tu auditoría.

---

## 10 · Cierre · 10 s

**En pantalla:** el logo otra vez, y debajo la última frase.

> Aegis no es un agente con acceso a tu dinero.

> Es la capa que hace que delegárselo a un agente sea razonable.

---

## Si solo tienes 30 segundos

> Un agente que reparte tu dinero en Stellar dentro de los límites que tú le
> pones. Propone, un motor determinista decide si cabe en tus reglas, un
> Guardian calcula el riesgo y te lo explica, y todo queda en una bitácora
> verificable. Cualquier agente de IA puede conectarse por MCP, y ninguno puede
> enviar dinero: solo proponer.

---

## Las tres preguntas que van a hacer

No están en las diapositivas. Son para después.

**«¿Y si el modelo alucina?»**

> No puede autorizar nada. El modelo propone y redacta; deciden dos motores
> deterministas que no llaman a ningún LLM. Y el agente no escribe direcciones:
> solo puede referirse a destinos que tú registraste antes.

**«¿Quién custodia las claves?»**

> Tú, la tuya. El agente firma con un signer delegado al que le das peso
> limitado en tu cuenta, y se lo quitas cuando quieras. Hoy ese signer vive en
> una variable de entorno, y lo tenemos documentado como bloqueante para
> mainnet: hace falta un KMS.

**«¿Los límites se aplican en la cadena?»**

> Todavía no: se aplican fuera. Está escrito en el plan, y hay un informe con
> las dos formas de arreglarlo, una con smart accounts de Soroban. Para testnet
> no cambia nada; para mainnet es lo primero de la lista.

Responderlas así, sin adornos, convence más que esquivarlas. Un jurado técnico
va a encontrar las costuras igualmente; que las hayas encontrado tú primero es
lo que te separa de quien no las ha buscado.

---

## Al ensayar

- **Cronométralo una vez de verdad**, en voz alta. Leyendo por encima siempre
  parece que cabe.
- Las diapositivas 2 y 3 son las que no hay que correr. El resto se puede
  acelerar sin perder nada.
- Si te quedas sin tiempo, salta la 7 y acorta la 9. **Nunca acortes el cierre**:
  es la frase que se llevan.
