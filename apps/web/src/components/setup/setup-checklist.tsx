'use client';

import { DEFAULT_POLICY_CONFIG, type PolicyConfig } from '@aegis/contracts';
import { ArrowRight, Check, Circle } from 'lucide-react';
import Link from 'next/link';
import { QueryState } from '@/components/dashboard/query-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDestinations, usePolicy } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth/auth-context';
import { cn, shortAddress } from '@/lib/utils';

/**
 * Los pasos para dejar Aegis listo (FE-04).
 *
 * Cada paso dice su estado real, no uno inventado: la sesión y los destinos se
 * leen de la API, y «límites revisados» se deduce de si la configuración
 * sigue en los valores por defecto. La delegación no aparece aquí porque la
 * API no expone los signers de la cuenta, así que el frontend **no puede
 * saber** si ya está hecha; vive abajo, como acción.
 */

interface Step {
  id: string;
  title: string;
  done: boolean;
  detail: string;
  href?: string;
  cta?: string;
}

/** ¿Se ha tocado algo, o todo sigue como venía de fábrica? */
function isDefaultPolicy(config: PolicyConfig): boolean {
  return (
    config.maxAmountPerOperation === DEFAULT_POLICY_CONFIG.maxAmountPerOperation &&
    config.maxDailyAmount === DEFAULT_POLICY_CONFIG.maxDailyAmount &&
    config.minimumReserve === DEFAULT_POLICY_CONFIG.minimumReserve &&
    config.maxOperationsPerHour === DEFAULT_POLICY_CONFIG.maxOperationsPerHour &&
    config.proposalTtlMinutes === DEFAULT_POLICY_CONFIG.proposalTtlMinutes &&
    config.mode === DEFAULT_POLICY_CONFIG.mode
  );
}

export function SetupChecklist() {
  const { session } = useAuth();
  const destinations = useDestinations();
  const policy = usePolicy();

  const count = destinations.data?.destinations.length ?? 0;
  const config = policy.data?.config;

  const steps: Step[] = [
    {
      id: 'wallet',
      title: 'Wallet conectada',
      done: Boolean(session),
      detail: session
        ? `${shortAddress(session.user.address)} · testnet`
        : 'Conecta tu wallet para empezar.',
    },
    {
      id: 'destinos',
      title: 'Destinos registrados',
      done: count > 0,
      detail:
        count > 0
          ? `${count} destino${count === 1 ? '' : 's'}. El agente solo puede enviar ahí.`
          : 'Sin destinos, el agente no tiene a dónde enviar nada.',
      href: '/destinos',
      cta: count > 0 ? 'Ver destinos' : 'Registrar el primero',
    },
    {
      id: 'limites',
      title: 'Límites revisados',
      done: Boolean(config) && !isDefaultPolicy(config as PolicyConfig),
      detail: config
        ? isDefaultPolicy(config)
          ? 'Siguen los valores por defecto. Míralos aunque te valgan: son tu único tope.'
          : 'Los has ajustado a tu medida.'
        : '',
      href: '/limites',
      cta: 'Revisar límites',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Antes de empezar</CardTitle>
        <CardDescription>
          Tres cosas que conviene tener en su sitio antes de dejar que el agente proponga nada.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <QueryState
          isLoading={destinations.isLoading || policy.isLoading}
          error={destinations.error ?? policy.error}
          rows={3}
        >
          <ol className="flex flex-col divide-y divide-border">
            {steps.map((step) => (
              <li key={step.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border',
                    step.done
                      ? 'border-transparent bg-risk-low/20 text-risk-low'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {step.done ? <Check className="size-4" /> : <Circle className="size-2.5" />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>

                {step.href ? (
                  <Link
                    href={step.href}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors hover:bg-accent"
                  >
                    {step.cta}
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </QueryState>
      </CardContent>
    </Card>
  );
}
