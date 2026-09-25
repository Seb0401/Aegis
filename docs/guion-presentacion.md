# Guion para presentar Aegis

Esto **sí** es para decirlo en voz alta. Son unos 3 minutos hablando a ritmo
normal, sin correr.

El [runbook de la demo](runbooks/demo.md) dice qué hay que tener preparado y
qué hacer si algo falla en directo. Aquí están las palabras.

Lo que va `> así` se dice. Lo que va `[entre corchetes]` es lo que haces
mientras.

---

## 1 · El problema · 20 s

`[En pantalla: nada, o el título]`

> Si trabajas por tu cuenta, cobras cuando cobras. Y cada vez que entra dinero
> tienes que decidir en caliente cuánto va a cada cosa: al viaje, al curso, al
> fondo de emergencia. El fondo de emergencia siempre es lo último.

> No es un problema de disciplina. Es que decidir cansa, y te toca decidir justo
> en el peor momento.

---

## 2 · Por qué no basta con "que lo haga una IA" · 25 s

> La respuesta obvia es: que lo reparta un agente. Y la razón por la que nadie
> lo hace es igual de obvia: darle acceso a tu dinero da miedo, y da miedo por
> buenas razones. Puede equivocarse, puede gastar de más, y puede ser
> manipulado.

> Hoy la elección es control total o nada. **Aegis es lo que falta en el
> medio.**

Si solo se recuerda una frase de toda la presentación, que sea esa. Sin ella,
lo que viene después parece una aplicación de finanzas más.

---

## 3 · La demo · 90 s

El orden importa: primero que funciona, luego que es seguro, y al final que
cualquier agente puede usarlo.

### a) Funciona · 30 s

`[Escribir en el chat: "reparte 50 entre mis objetivos y guarda 10 para emergencias"]`

> Le hablo como le hablaría a una persona. No elijo direcciones ni importes.

`[Enseñar la propuesta: los cuatro pagos, el valor en dólares, la explicación]`

> Antes de que se mueva nada, me dice qué va a hacer, cuánto vale en dólares y
> por qué. Apruebo.

`[Aprobar. Abrir Stellar Expert con la transacción]`

> Eso acaba de ocurrir en la red Stellar. Cuatro pagos, en un segundo, por
> fracciones de céntimo.

### b) Es seguro · 40 s

Esta es la parte que nos diferencia. Dos cosas, sin prisa.

`[Pedir algo que se pase del límite por operación]`

> Los límites los pongo yo, y atan de verdad. Esto se pasa del máximo por
> operación, así que se queda esperando mi confirmación, y me dice exactamente
> qué regla lo ha parado. El límite se puede poner en el activo o en dólares:
> "no más de veinte dólares al día" significa veinte dólares, suba o baje el
> XLM.

`[Enseñar una propuesta con riesgo: el porcentaje del saldo, el saldo que quedaría]`

> Y cada operación pasa por el Guardian, que calcula el riesgo: cuánto es sobre
> tu saldo, con qué te quedas, si el destino es nuevo.

> **Estas cifras no las escribe el modelo.** El modelo solo las redacta. Quien
> decide si algo se autoriza es un motor determinista: con los mismos datos, da
> siempre la misma respuesta, y se puede auditar. Una alucinación no puede
> mover dinero.

`[Si hay tiempo: pausar el agente con el kill switch y pedir otra cosa]`

> Y si en algún momento desconfío: un botón, y el agente no propone nada más.

### c) Cualquier agente puede usarlo · 20 s

`[Claude Desktop con el servidor MCP conectado. Pedirle un reparto]`

> Aegis habla MCP, así que cualquier agente de IA puede conectarse. Mira lo que
> pasa: la propuesta aparece aquí, **esperando mi aprobación**.

> Ningún agente puede enviar dinero. Ninguna herramienta lo permite. Todos
> heredan mis límites, mi análisis de riesgo y mi auditoría.

---

## 4 · Por qué Stellar · 25 s

> Repartir un ingreso en cuatro pagos cuesta fracciones de céntimo. En una red
> cara, el reparto se comería el ahorro: no habría producto. Liquida en
> segundos, y no hace falta cuenta bancaria ni monto mínimo.

> Además, todo lo que ha hecho el agente queda en una bitácora encadenada por
> hashes. Si alguien tocara un registro del pasado, los siguientes dejarían de
> cuadrar y la propia aplicación lo diría.

---

## 5 · Cierre · 20 s

> Aegis no es un agente con acceso a tu dinero.

> Es la capa que hace que delegárselo a un agente sea razonable.

> Está en testnet, funcionando, y el código es abierto.

---

## Si solo hay 30 segundos

> Un agente que reparte tu dinero en Stellar dentro de los límites que tú le
> pones. Propone, un motor determinista decide si cabe en tus reglas, un
> Guardian calcula el riesgo y te lo explica en lenguaje normal, y todo queda
> en una bitácora que se puede verificar. Cualquier agente de IA puede
> conectarse por MCP, y ninguno puede enviar dinero: solo proponer.

---

## Las tres preguntas que van a hacer

**"¿Y si el modelo alucina?"**

> No puede autorizar nada. El modelo propone y redacta; quien decide son dos
> motores deterministas que no llaman a ningún LLM. Y el agente no escribe
> direcciones: solo puede referirse a destinos que tú registraste antes.

**"¿Quién custodia las claves?"**

> Tú, la tuya. El agente firma con un signer delegado al que le das peso
> limitado en tu cuenta, y se lo puedes quitar cuando quieras. Hoy ese signer
> vive en una variable de entorno, y eso está documentado como bloqueante para
> mainnet: hace falta un KMS. Preferimos decirlo a que lo encuentre alguien.

**"¿Los límites se aplican en la cadena?"**

> No, todavía no: se aplican fuera. Está escrito en el plan y hay un informe
> sobre las dos formas de arreglarlo, una de ellas con smart accounts de
> Soroban. Para una demo en testnet no cambia nada; para mainnet es lo primero
> de la lista.

Responder esto así, sin adornos, convence más que esquivarlo. Un jurado técnico
va a encontrar las costuras igualmente; que las hayas encontrado tú primero es
lo que te separa de quien no las ha buscado.

---

## Lo que no hay que hacer

- **No enseñar código.** Nadie lo va a leer y se come el tiempo de lo que sí
  importa.
- **No decir "usamos IA"** y quedarse ahí. Lo interesante es justo lo
  contrario: que **ninguna decisión de autorización depende del modelo**.
- **No prometer mainnet.** Es testnet. Decirlo da credibilidad, no la quita.
- **No improvisar.** Ensayar el flujo entero una vez: la primera respuesta del
  agente puede tardar unos segundos, y en directo eso se hace eterno.
