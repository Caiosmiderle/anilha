/**
 * Login by the link in the e-mail, the fallback to the 6-digit code. Supabase sends
 * the person back with the session in the URL hash; here the local API issues the
 * same tokens.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import { API, passConsent, uniqueEmail } from './helpers';

/** The tokens Supabase puts in the hash after the person clicks the link. */
async function linkSession(request: APIRequestContext, prefix: string) {
  const email = uniqueEmail(prefix);
  await request.post(`${API}/auth/v1/otp`, { data: { email } });
  const otp = await request.get(`${API}/dev/otp?email=${encodeURIComponent(email)}`);
  const { code } = (await otp.json()) as { code: string };
  const verify = await request.post(`${API}/auth/v1/verify`, {
    data: { type: 'email', email, token: code },
  });
  return (await verify.json()) as { access_token: string; refresh_token: string };
}

test('entrar pelo link do e-mail', async ({ page, request }) => {
  const session = await linkSession(request, 'link');

  await page.goto(
    `/#access_token=${session.access_token}&refresh_token=${session.refresh_token}` +
      '&expires_in=3600&token_type=bearer&type=magiclink',
  );
  await passConsent(page);
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  // The tokens leave the address bar.
  expect(page.url()).not.toContain('access_token');

  // The session is real: it survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
});

test('link expirado avisa e deixa pedir código', async ({ page }) => {
  await page.goto(
    '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  );
  await expect(page.getByText('O link expirou ou já foi usado. Peça um código novo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar código' })).toBeVisible();
  expect(page.url()).not.toContain('error');
});

test('login pelo link continua se a página recarregar no meio', async ({ page, request }) => {
  // A new version of the app reloads the page right after the link opens it; the
  // hash is gone by then, so the link has to come back from sessionStorage.
  const session = await linkSession(request, 'recarga');
  await page.goto('/entrar');
  await page.evaluate((s) => {
    sessionStorage.setItem(
      'anilha:auth-link',
      JSON.stringify({
        kind: 'session',
        accessToken: s.access_token,
        refreshToken: s.refresh_token,
      }),
    );
  }, session);
  await page.reload();
  await passConsent(page);
  await expect(page.getByRole('heading', { name: 'Vamos montar seu plano' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('anilha:auth-link'))).toBeNull();
});
