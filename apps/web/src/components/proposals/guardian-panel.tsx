import type { Explanation, RiskLevel, RiskReport } from '@aegis/contracts';
import { Info, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Jupi } from '@/components/jupi/jupi';
import { Badge } from '@/components/ui/badge';
import { moodForRisk } from '@/lib/jupi';
import { RISK_LABEL, RISK_VARIANT, SIGNAL_NAME } from '@/lib/proposals';
import { cn, formatAmount } from '@/lib/utils';

/**
 * Panel del Guardian (FE-08).
 *
 * El texto de cada advertencia lo escribe el Guardian, no esta pantalla: viene
 * en `explanation.warnings`, construido a partir de las cifras reales de la
 * señal. Aquí no se inventa ni se recalcula nada, solo se ordena y se pinta.
 *
 * Las señales `INFO` sí se listan, pero por su nombre y aparte: se evaluaron y
 * no dispararon nada. Esconderlas daría la impresión de que el Guardian mira
 * menos cosas de las que mira.
 */
export function GuardianPanel({
  risk,
  explanation,
}: {
  risk: RiskReport;
  explanation?: Explanation | null;
}) {
  const warnings = explanation?.warnings ?? [];
  const severityById = new Map(risk.signals.map((signal) => [signal.id, signal.severity]));

  // Una misma señal puede dispararse en varias acciones: G-01 en un destino
  // nuevo y, a la vez, G-01 informativa en otro. Listarla en los dos sitios
  // daba a entender que el Guardian se contradecía, así que lo informativo es
  // solo lo que no salió ya como advertencia, y sin repetir nombres.
  const warnedIds = new Set(warnings.map((warning) => warning.signalId));
  const infoNames = [
    ...new Set(
      risk.signals
        .filter((signal) => signal.severity === 'INFO' && !warnedIds.has(signal.id))
        .map((signal) => SIGNAL_NAME[signal.id]),
    ),
  ];

  return (
    <section
      aria-label="Análisis del Guardian"
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <RiskIcon level={risk.level} />
          Guardian
        </span>
        <Badge variant={RISK_VARIANT[risk.level]}>{RISK_LABEL[risk.level]}</Badge>
        <span className="text-xs text-muted-foreground tabular-nums">
          puntuación {risk.score}/100
        </span>
      </header>

      {explanation ? (
        /*
          La burbuja del mockup: Jupi pone la cara que corresponde al veredicto
          del Guardian, pero el texto es el del Guardian, palabra por palabra.
          La mascota acompaña la explicación; no la escribe ni la matiza.
        */
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
          <Jupi mood={moodForRisk(risk.level)} size={44} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Jupi te lo explica en lenguaje normal
            </p>
            <p className="mt-1 text-sm">{explanation.summary}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          El Guardian evaluó la propuesta pero no hay explicación disponible.
        </p>
      )}

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {warnings.map((warning, index) => {
            const severity = severityById.get(warning.signalId);
            return (
              <li key={`${warning.signalId}-${index}`} className="flex items-start gap-2 text-sm">
                <TriangleAlert
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    severity === 'HIGH' ? 'text-risk-high' : 'text-risk-medium',
                  )}
                />
                <span>
                  {warning.text}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({warning.signalId} · {SIGNAL_NAME[warning.signalId]})
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-risk-low" />
          Ninguna señal saltó por encima de informativa.
        </p>
      )}

      <footer className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          Saldo estimado después de ejecutarla (comisiones incluidas):{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatAmount(risk.balanceAfter)}
          </span>
        </p>

        {infoNames.length > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>Se evaluaron sin encontrar nada: {infoNames.join(', ')}.</span>
          </p>
        ) : null}

        {explanation?.generatedBy === 'template' ? (
          <p className="text-xs text-muted-foreground">
            Explicación generada con la plantilla determinista del Guardian.
          </p>
        ) : null}
      </footer>
    </section>
  );
}

function RiskIcon({ level }: { level: RiskLevel }) {
  if (level === 'LOW') return <ShieldCheck className="size-4 text-risk-low" />;
  if (level === 'MEDIUM') return <ShieldAlert className="size-4 text-risk-medium" />;
  if (level === 'HIGH') return <ShieldAlert className="size-4 text-risk-high" />;
  return <ShieldAlert className="size-4 text-risk-critical" />;
}
