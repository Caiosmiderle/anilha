interface CodeError {
  message: string;
  clearCode: boolean;
}

/** Only an explicit OTP rejection should blame the code and discard it. */
export function classifyCodeError(error: unknown, online: boolean): CodeError {
  const details =
    typeof error === 'object' && error !== null
      ? (error as { status?: unknown; code?: unknown; name?: unknown })
      : {};

  if (!online) {
    return { message: 'Sem conexão agora. Tente de novo', clearCode: false };
  }
  if (details.status === 429) {
    return { message: 'Muitas tentativas. Peça outro', clearCode: true };
  }
  if (typeof details.status === 'number' && details.status >= 500 && details.status < 600) {
    return { message: 'Serviço indisponível agora. Tente de novo', clearCode: false };
  }
  // Supabase wraps fetch failures in AuthRetryableFetchError with status 0.
  if (error instanceof TypeError || details.name === 'AuthRetryableFetchError') {
    return { message: 'Sem conexão agora. Tente de novo', clearCode: false };
  }
  if (
    details.code === 'otp_expired' ||
    details.code === 'otp_invalid' ||
    details.code === 'invalid_credentials' ||
    // A rejected code without a code name still comes back as a client error.
    (details.code == null && [400, 401, 403, 422].includes(details.status as number))
  ) {
    return { message: 'Código inválido ou expirado', clearCode: true };
  }
  // Unknown failures (including local account setup) do not prove the OTP is wrong.
  return { message: 'Serviço indisponível agora. Tente de novo', clearCode: false };
}
