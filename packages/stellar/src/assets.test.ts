import { AssetCodeSchema } from '@aegis/contracts';
import { Asset, Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { ON_CHAIN_ASSET_CODE, TESTNET_USDC, toInternalAssetCode } from './assets.js';

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

describe('activo configurable', () => {
  it('permite apuntar al USDC canónico de testnet sin tocar el contrato', () => {
    // Dentro de Aegis se sigue llamando USDC_TEST valga lo que valga en la red.
    expect(toInternalAssetCode(TESTNET_USDC.code, TESTNET_USDC.code)).toBe('USDC_TEST');
    expect(TESTNET_USDC.issuer).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it('con otro código configurado, el nuestro deja de reconocerse', () => {
    expect(toInternalAssetCode('USDCTEST', 'USDC')).toBeNull();
  });

  it('XLM se reconoce siempre, sea cual sea la configuración', () => {
    expect(toInternalAssetCode('XLM', 'USDC')).toBe('XLM');
  });
});
