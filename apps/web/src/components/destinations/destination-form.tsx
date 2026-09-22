'use client';

import {
  AssetCodeSchema,
  DestinationKindSchema,
  StellarAddressSchema,
  sanitizeText,
  type AssetCode,
  type DestinationKind,
} from '@aegis/contracts';
import { Check, CircleCheck, Loader2, Plus, ShieldAlert, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { describeError } from '@/lib/api/errors';
import { useCreateDestination } from '@/lib/api/hooks';

/**
 * Alta de un destino (FE-10).
 *
 * Este formulario es **la única puerta** por la que entra una dirección Stellar
 * nueva al sistema (principio nº 2 del PLAN). El agente jamás escribe una: solo
 * referencia ids de esta lista. Por eso el alta es en dos pasos, y el segundo
 * enseña la dirección completa y en monoespaciada: pegar una dirección
 * equivocada es un error que después nadie puede deshacer, porque la dirección
 * de un destino registrado no se puede editar.
 */

const KIND_OPTIONS: Array<{ value: DestinationKind; label: string; hint: string }> = [
  { value: 'GOAL', label: 'Objetivo', hint: 'Una cuenta tuya para ahorrar con una meta' },
  { value: 'CONTACT', label: 'Contacto', hint: 'Alguien a quien le envías dinero' },
  {
    value: 'EMERGENCY_FUND',
    label: 'Fondo de emergencia',
    hint: 'Objetivo especial protegido por la regla P-06',
  },
];

export function DestinationForm() {
  const create = useCreateDestination();

  const [kind, setKind] = useState<DestinationKind>('GOAL');
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetAsset, setTargetAsset] = useState<AssetCode>('XLM');
  const [trusted, setTrusted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Tras registrar, el formulario se vacía. Sin este aviso, el usuario ve
  // campos en blanco y no sabe si se guardó o si se perdió lo que escribió.
  const [created, setCreated] = useState<string | null>(null);

  const cleanLabel = sanitizeText(label);
  const cleanAddress = address.trim().toUpperCase();
  const addressValid = StellarAddressSchema.safeParse(cleanAddress).success;
  // El servidor sanea la etiqueta y rechaza con 400 la que quede vacía. Avisar
  // aquí da un mensaje mejor que un error genérico después de enviar.
  const labelValid = cleanLabel.length > 0 && cleanLabel.length <= 64;
  const targetValid = targetAmount === '' || /^\d+(\.\d{1,7})?$/.test(targetAmount.trim());
  const valid = labelValid && addressValid && targetValid;

  function reset() {
    setCreated(cleanLabel);
    setLabel('');
    setAddress('');
    setTargetAmount('');
    setTrusted(false);
    setConfirming(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setConfirming(true);
  }

  /** Cualquier edición nueva retira el aviso de la anterior. */
  function edit(setter: (value: string) => void) {
    return (value: string) => {
      setCreated(null);
      setter(value);
    };
  }

  function onConfirm() {
    create.mutate(
      {
        kind,
        label: cleanLabel,
        address: cleanAddress,
        trusted,
        ...(targetAmount.trim() ? { targetAmount: targetAmount.trim(), targetAsset } : {}),
      },
      { onSuccess: reset },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar un destino</CardTitle>
        <CardDescription>
          El agente solo puede enviar dinero a lo que esté en esta lista. La dirección no se podrá
          editar después.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {confirming ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md border border-risk-medium/40 bg-risk-medium/10 p-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-risk-medium" />
              <p className="text-sm">
                Comprueba la dirección carácter a carácter. Una vez registrada no se puede cambiar:
                para enviar a otra hay que dar de alta un destino nuevo.
              </p>
            </div>

            <dl className="flex flex-col gap-2 text-sm">
              <Field
                label="Tipo"
                value={KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind}
              />
              <Field label="Etiqueta" value={cleanLabel} />
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">Dirección</dt>
                <dd className="break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">
                  {cleanAddress}
                </dd>
              </div>
              {targetAmount.trim() ? (
                <Field label="Meta" value={`${targetAmount.trim()} ${targetAsset}`} />
              ) : null}
              <Field label="De confianza" value={trusted ? 'Sí (exime de la señal G-01)' : 'No'} />
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button disabled={create.isPending} onClick={onConfirm}>
                {create.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                Confirmar y registrar
              </Button>
              <Button
                variant="ghost"
                disabled={create.isPending}
                onClick={() => setConfirming(false)}
              >
                <X />
                Volver a editar
              </Button>
            </div>

            {create.error ? (
              <p role="alert" className="text-sm text-destructive">
                {describeError(create.error)}
              </p>
            ) : null}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {created ? (
              <p
                role="status"
                className="flex items-center gap-2 rounded-md border border-risk-low/40 bg-risk-low/10 p-3 text-sm"
              >
                <CircleCheck className="size-4 shrink-0 text-risk-low" />«{created}» quedó
                registrado. Ya puedes pedirle al agente que le envíe dinero.
              </p>
            ) : null}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Tipo</legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                {KIND_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex flex-1 cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
                  >
                    <input
                      type="radio"
                      name="kind"
                      className="mt-1"
                      value={option.value}
                      checked={kind === option.value}
                      onChange={() => setKind(DestinationKindSchema.parse(option.value))}
                    />
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Etiqueta</span>
              <Input
                value={label}
                maxLength={128}
                onChange={(event) => edit(setLabel)(event.target.value)}
                placeholder="Viaje a Cusco"
                aria-invalid={label.length > 0 && !labelValid}
              />
              {label.length > 0 && !labelValid ? (
                <span className="text-xs text-destructive">
                  La etiqueta no puede quedar vacía tras limpiar caracteres invisibles, ni pasar de
                  64 caracteres.
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Es el nombre que usará el agente al hablar de este destino.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Dirección Stellar</span>
              <Input
                value={address}
                onChange={(event) => edit(setAddress)(event.target.value.toUpperCase())}
                placeholder="G…"
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-xs"
                aria-invalid={address.length > 0 && !addressValid}
              />
              {address.length > 0 && !addressValid ? (
                <span className="text-xs text-destructive">
                  No parece una clave pública de Stellar: 56 caracteres que empiezan por G.
                </span>
              ) : null}
            </label>

            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
              <label className="flex flex-1 flex-col gap-1.5 text-sm">
                <span className="font-medium">Meta (opcional)</span>
                <Input
                  value={targetAmount}
                  inputMode="decimal"
                  onChange={(event) => setTargetAmount(event.target.value)}
                  placeholder="500"
                  aria-invalid={!targetValid}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="sr-only">Activo de la meta</span>
                <select
                  value={targetAsset}
                  onChange={(event) => setTargetAsset(AssetCodeSchema.parse(event.target.value))}
                  className="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {AssetCodeSchema.options.map((asset) => (
                    <option key={asset} value={asset}>
                      {asset}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={trusted}
                onChange={(event) => setTrusted(event.target.checked)}
              />
              <span>
                Marcar como de confianza
                <span className="block text-xs text-muted-foreground">
                  Exime a este destino de la señal G-01 (&laquo;dirección nunca vista&raquo;). Se
                  puede cambiar después.
                </span>
              </span>
            </label>

            <div>
              <Button type="submit" disabled={!valid}>
                <Plus />
                Continuar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
