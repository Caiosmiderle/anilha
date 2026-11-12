import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { classifyCodeError } from '../authCodeError';

describe('classifyCodeError', () => {
  it.each(['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])(
    'preserva o código quando fetch falha: %s',
    (message) => {
      expect(classifyCodeError(new TypeError(message), true)).toEqual({
        message: 'Sem conexão agora. Tente de novo',
        clearCode: false,
      });
    },
  );

  it('recebe navigator.onLine como argumento e prioriza o estado offline', () => {
    expect(
      classifyCodeError(
        new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'),
        false,
      ),
    ).toEqual({ message: 'Sem conexão agora. Tente de novo', clearCode: false });
  });

  it('reconhece a falha de fetch encapsulada pelo Supabase', () => {
    expect(classifyCodeError(new AuthRetryableFetchError('Failed to fetch', 0), true)).toEqual({
      message: 'Sem conexão agora. Tente de novo',
      clearCode: false,
    });
  });

  it.each([500, 502, 503, 504, 599])('preserva o código em HTTP %i', (status) => {
    expect(classifyCodeError(new AuthRetryableFetchError('Unavailable', status), true)).toEqual({
      message: 'Serviço indisponível agora. Tente de novo',
      clearCode: false,
    });
  });

  it('prioriza HTTP 5xx mesmo que a resposta contenha um código de OTP', () => {
    expect(classifyCodeError(new AuthApiError('Unavailable', 500, 'otp_expired'), true)).toEqual({
      message: 'Serviço indisponível agora. Tente de novo',
      clearCode: false,
    });
  });

  it.each(['otp_expired', 'otp_invalid', 'invalid_credentials'])(
    'limpa o código recusado explicitamente pelo Supabase: %s',
    (code) => {
      expect(
        classifyCodeError(new AuthApiError('Token has expired or is invalid', 403, code), true),
      ).toEqual({ message: 'Código inválido ou expirado', clearCode: true });
    },
  );

  it('mantém o tratamento de excesso de tentativas', () => {
    expect(
      classifyCodeError(
        new AuthApiError('Too many requests', 429, 'over_request_rate_limit'),
        true,
      ),
    ).toEqual({ message: 'Muitas tentativas. Peça outro', clearCode: true });
  });

  it.each([
    null,
    undefined,
    'falha',
    new Error('sem usuário'),
    { status: 403, code: 'otp_disabled' },
  ])('não culpa o código por um erro desconhecido: %s', (error) => {
    expect(classifyCodeError(error, true)).toEqual({
      message: 'Serviço indisponível agora. Tente de novo',
      clearCode: false,
    });
  });
});

describe('código recusado sem nome de erro', () => {
  it.each([400, 401, 403, 422])('status %i culpa o código e limpa o campo', (status) => {
    expect(classifyCodeError({ status }, true)).toEqual({
      message: 'Código inválido ou expirado',
      clearCode: true,
    });
  });
});
