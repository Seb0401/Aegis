import { AssetCodeSchema } from '@aegis/contracts';
import { Asset, Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { ON_CHAIN_ASSET_CODE, toInternalAssetCode } from './assets.js';

describe('códigos de activo', () => {
  it('cubre todos los activos del contrato', () => {
    // Si alguien añade un activo y no lo mapea, la traducción fallaría en
    // silencio al llegar a la red. Mejor que falle aquí.
    for (const code of AssetCodeSchema.options) {
      expect(ON_CHAIN_ASSET_CODE[code], `falta el código de red de ${code}`).toBeTruthy();
    }
  });

  it('el viaje de ida y vuelta devuelve el mismo activo', () => {
    for (const code of AssetCodeSchema.options) {
      expect(toInternalAssetCode(ON_CHAIN_ASSET_CODE[code])).toBe(code);
    }
  });

  it('todos los códigos son válidos para Stellar', () => {
    // Este es el test que faltaba: `USDC_TEST` lleva guion bajo y Stellar solo
    // admite alfanuméricos, así que ese activo nunca habría existido en la red.
    const issuer = Keypair.random().publicKey();

    for (const code of AssetCodeSchema.options) {
      const onChain = ON_CHAIN_ASSET_CODE[code];
      expect(onChain).toMatch(/^[a-zA-Z0-9]{1,12}$/);

      if (onChain !== 'XLM') {
        expect(() => new Asset(onChain, issuer)).not.toThrow();
      }
    }
  });

  it('un activo desconocido devuelve null en vez de forzarse', () => {
    expect(toInternalAssetCode('EURC')).toBeNull();
    expect(toInternalAssetCode('USDC_TEST')).toBeNull();
  });
});
