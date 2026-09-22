'use client';

import {
  AssetCodeSchema,
  type AssetCode,
  type OperationMode,
  type PolicyConfig,
  type PolicySummary,
  type UpdatePolicyInput,
} from '@aegis/contracts';
import { Loader2, Save, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { QueryState } from '@/components/dashboard/query-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { describeError } from '@/lib/api/errors';
import { usePolicy, useUpdatePolicy } from '@/lib/api/hooks';
import { formatAmount } from '@/lib/utils';

/**
 * Límites y modo de operación (FE-09, reglas P-01…P-07).
 *
 * Estos números son lo único que separa «el agente puede moverme dinero» de
 * «el agente puede moverme todo el dinero», así que cada campo dice qué regla
 * aplica y qué pasa si se cambia. Se envía solo lo que cambió: `PUT /policy`
 * acepta parciales, y mandar el objeto entero convertiría cualquier lectura
 * desactualizada en una sobreescritura silenciosa.
 */
export function PolicyForm() {
  const { data, isLoading, error } = usePolicy();

  return (
    <QueryState isLoading={isLoading} error={error} rows={8}>
      {data ? (
        // La clave reinicia el formulario cuando la API devuelve otra
        // configuración, p. ej. tras guardar o tras tocar el kill switch.
        <PolicyFields
          key={JSON.stringify(data.config)}
          config={data.config}
          summary={data.summary}
        />
      ) : null}
    </QueryState>
  );
}

const AMOUNT_PATTERN = /^\d+(\.\d{1,7})?$/;

function PolicyFields({ config, summary }: { config: PolicyConfig; summary: PolicySummary }) {
  const update = useUpdatePolicy();

  const [mode, setMode] = useState<OperationMode>(config.mode);
  const [maxPerOperation, setMaxPerOperation] = useState(config.maxAmountPerOperation);
  const [maxDaily, setMaxDaily] = useState(config.maxDailyAmount);
  const [minimumReserve, setMinimumReserve] = useState(config.minimumReserve);
  const [maxPerHour, setMaxPerHour] = useState(String(config.maxOperationsPerHour));
  const [ttlMinutes, setTtlMinutes] = useState(String(config.proposalTtlMinutes));
  const [assets, setAssets] = useState<AssetCode[]>(config.allowedAssets);
  const [requireNewDestination, setRequireNewDestination] = useState(
    config.requireConfirmationForNewDestination,
  );

  const amountsValid = [maxPerOperation, maxDaily, minimumReserve].every((value) =>
    AMOUNT_PATTERN.test(value.trim()),
  );
  const countsValid = [maxPerHour, ttlMinutes].every((value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0;
  });
  const valid = amountsValid && countsValid && assets.length > 0;

  /** Solo los campos que de verdad cambiaron. */
  function buildPatch(): UpdatePolicyInput {
    const patch: UpdatePolicyInput = {};
    if (mode !== config.mode) patch.mode = mode;
    if (maxPerOperation.trim() !== config.maxAmountPerOperation) {
      patch.maxAmountPerOperation = maxPerOperation.trim();
    }
    if (maxDaily.trim() !== config.maxDailyAmount) patch.maxDailyAmount = maxDaily.trim();
    if (minimumReserve.trim() !== config.minimumReserve) {
      patch.minimumReserve = minimumReserve.trim();
    }
    if (Number(maxPerHour) !== config.maxOperationsPerHour) {
      patch.maxOperationsPerHour = Number(maxPerHour);
    }
    if (Number(ttlMinutes) !== config.proposalTtlMinutes) {
      patch.proposalTtlMinutes = Number(ttlMinutes);
    }
    if (requireNewDestination !== config.requireConfirmationForNewDestination) {
      patch.requireConfirmationForNewDestination = requireNewDestination;
    }
    if (
      assets.length !== config.allowedAssets.length ||
      assets.some((asset) => !config.allowedAssets.includes(asset))
    ) {
      patch.allowedAssets = assets;
    }
    return patch;
  }

  const patch = buildPatch();
  const dirty = Object.keys(patch).length > 0;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !dirty) return;
    update.mutate(patch);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Modo de operación</CardTitle>
          <CardDescription>Regla P-07. Decide cuándo hace falta tu firma.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <ModeOption
              value="MANUAL"
              current={mode}
              onSelect={setMode}
              title="Manual"
              hint="Confirmas y firmas todas las operaciones."
            />
            <ModeOption
              value="AUTONOMOUS"
              current={mode}
              onSelect={setMode}
              title="Autónomo"
              hint="Ejecuta sin preguntar mientras se mantenga dentro de tus límites."
            />
          </div>

          {mode === 'AUTONOMOUS' ? (
            <p className="flex items-start gap-2 rounded-md border border-risk-medium/40 bg-risk-medium/10 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-risk-medium" />
              <span>
                El Guardian sigue corriendo también en autónomo: si el riesgo llega a medio o más,
                la propuesta vuelve a ti aunque esté dentro de los límites.
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Límites de gasto</CardTitle>
          <CardDescription>
            Los aplica el backend antes de construir nada. Hoy te queda{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatAmount(summary.remainingDailyAmount)}
            </span>{' '}
            del límite diario.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AmountField
            label="Máximo por operación"
            rule="P-01"
            value={maxPerOperation}
            onChange={setMaxPerOperation}
            hint="Ninguna operación individual puede superarlo."
          />
          <AmountField
            label="Límite diario"
            rule="P-02"
            value={maxDaily}
            onChange={setMaxDaily}
            hint="Suma máxima ejecutada en 24 horas."
          />
          <AmountField
            label="Reserva intocable"
            rule="P-06"
            value={minimumReserve}
            onChange={setMinimumReserve}
            hint="Saldo que el agente no puede tocar nunca."
          />
          <NumberField
            label="Operaciones por hora"
            rule="P-05"
            value={maxPerHour}
            onChange={setMaxPerHour}
            hint="Freno de velocidad contra un bucle del agente."
          />
          <NumberField
            label="Caducidad de propuestas (minutos)"
            rule="P-09"
            value={ttlMinutes}
            onChange={setTtlMinutes}
            hint="Pasado ese tiempo hay que volver a pedirla."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activos y destinos</CardTitle>
          <CardDescription>Reglas P-04 y P-03.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Activos permitidos</legend>
            <div className="flex flex-wrap gap-3">
              {AssetCodeSchema.options.map((asset) => (
                <label key={asset} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assets.includes(asset)}
                    onChange={(event) =>
                      setAssets((prev) =>
                        event.target.checked
                          ? [...prev, asset]
                          : prev.filter((item) => item !== asset),
                      )
                    }
                  />
                  {asset}
                </label>
              ))}
            </div>
            {assets.length === 0 ? (
              <span className="text-xs text-destructive">
                Tiene que quedar al menos un activo permitido.
              </span>
            ) : null}
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={requireNewDestination}
              onChange={(event) => setRequireNewDestination(event.target.checked)}
            />
            <span>
              Pedir confirmación para destinos nuevos
              <span className="block text-xs text-muted-foreground">
                Un destino sin historial siempre exige tu firma, aunque estés en modo autónomo.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!valid || !dirty || update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Guardar cambios
        </Button>

        {!dirty && update.isSuccess ? (
          <span className="text-sm text-muted-foreground">Guardado.</span>
        ) : null}
        {dirty ? (
          <span className="text-sm text-muted-foreground">
            {Object.keys(patch).length} cambio{Object.keys(patch).length === 1 ? '' : 's'} sin
            guardar.
          </span>
        ) : null}
      </div>

      {update.error ? (
        <p role="alert" className="text-sm text-destructive">
          {describeError(update.error)}
        </p>
      ) : null}
    </form>
  );
}

function ModeOption({
  value,
  current,
  onSelect,
  title,
  hint,
}: {
  value: OperationMode;
  current: OperationMode;
  onSelect: (mode: OperationMode) => void;
  title: string;
  hint: string;
}) {
  return (
    <label className="flex flex-1 cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
      <input
        type="radio"
        name="mode"
        className="mt-1"
        checked={current === value}
        onChange={() => onSelect(value)}
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function AmountField({
  label,
  rule,
  value,
  onChange,
  hint,
}: {
  label: string;
  rule: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  const valid = AMOUNT_PATTERN.test(value.trim());
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-baseline gap-2 font-medium">
        {label}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{rule}</span>
      </span>
      <Input
        value={value}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!valid}
      />
      <span className={valid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
        {valid ? hint : 'Usa un decimal con hasta 7 decimales, por ejemplo 12.5'}
      </span>
    </label>
  );
}

function NumberField({
  label,
  rule,
  value,
  onChange,
  hint,
}: {
  label: string;
  rule: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed > 0;
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-baseline gap-2 font-medium">
        {label}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{rule}</span>
      </span>
      <Input
        value={value}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!valid}
      />
      <span className={valid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
        {valid ? hint : 'Tiene que ser un entero mayor que cero.'}
      </span>
    </label>
  );
}
