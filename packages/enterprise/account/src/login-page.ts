/** Self-contained enterprise username and password page served from the Desktop Host. */

import type { SignInErrorCode } from '@deepseek-ai/dsh-deepseek-account/types'

/** Visible login-page failure category. */
export type EnterpriseLoginPageError = SignInErrorCode | 'invalid-credentials'

/** Inputs for one localized enterprise login page. */
export interface EnterpriseLoginPageInput {
  /** Configured product name shown as plain text. */
  readonly productName: string
  /** Random attempt nonce required by the Host form handler. */
  readonly nonce: string
  /** Active UI locale. */
  readonly locale: string
  /** Safe failure category from an earlier POST. */
  readonly error?: EnterpriseLoginPageError
}

/** Rendered page and security headers. */
export interface EnterpriseLoginPage {
  readonly html: string
  readonly headers: Readonly<Record<string, string>>
}

function escapeHtml(value: string): string {
  const entities: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/gu, character => entities[character] ?? character)
}

function message(locale: string, error: EnterpriseLoginPageError | undefined): {
  title: string
  username: string
  password: string
  submit: string
  error: string
} {
  const chinese = locale.toLowerCase().startsWith('zh')
  if (chinese) {
    return {
      title: '登录企业工作区',
      username: '用户名',
      password: '密码',
      submit: '登录',
      error: error === undefined
        ? ''
        : error === 'invalid-credentials'
          ? '用户名或密码不正确'
          : error === 'network'
            ? '无法连接企业登录服务'
            : '登录未完成，请重试',
    }
  }
  return {
    title: 'Sign in to your enterprise workspace',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    error: error === undefined
      ? ''
      : error === 'invalid-credentials'
        ? 'The username or password is incorrect'
        : error === 'network'
          ? 'The enterprise sign-in service is unavailable'
          : 'Sign-in did not finish; try again',
  }
}

/**
 * Render the enterprise login form with no external resources or scripts.
 * @param input - Product label, one-use nonce, active locale, and optional safe error.
 * @returns Complete HTML and response headers.
 */
export function renderEnterpriseLoginPage(input: EnterpriseLoginPageInput): EnterpriseLoginPage {
  const text = message(input.locale, input.error)
  const productName = escapeHtml(input.productName)
  const nonce = escapeHtml(input.nonce)
  const error = text.error === '' ? '' : `<p role="alert">${escapeHtml(text.error)}</p>`
  const html = `<!doctype html><html lang="${input.locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'}">`
    + '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<meta name="referrer" content="no-referrer"><title>${productName}</title>`
    + `<style nonce="${nonce}">:root{color-scheme:light dark;font-family:system-ui,sans-serif}`
    + 'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;color:#16181d}'
    + 'main{box-sizing:border-box;width:min(28rem,calc(100vw - 2rem));padding:2rem;border:1px solid #d8dbe2;border-radius:16px;background:#fff}'
    + 'h1{font-size:1.35rem;margin:0 0 .5rem}p{color:#8a1f1f}label{display:block;margin-top:1rem;font-size:.9rem}'
    + 'input,button{box-sizing:border-box;width:100%;margin-top:.4rem;padding:.75rem;border-radius:8px;font:inherit}'
    + 'input{border:1px solid #b8bdc8;background:transparent;color:inherit}button{border:0;background:#315efb;color:#fff;margin-top:1.5rem;cursor:pointer}'
    + '@media(prefers-color-scheme:dark){body{background:#111318;color:#f4f5f7}main{background:#1b1e25;border-color:#343942}input{border-color:#555c69}}'
    + '</style>'
    + `<main><h1>${escapeHtml(text.title)}</h1><p>${productName}</p>${error}`
    + '<form method="post">'
    + `<input type="hidden" name="nonce" value="${nonce}">`
    + `<label>${escapeHtml(text.username)}<input name="username" autocomplete="username" required autofocus></label>`
    + `<label>${escapeHtml(text.password)}<input name="password" type="password" autocomplete="current-password" required></label>`
    + `<button type="submit">${escapeHtml(text.submit)}</button></form></main></html>`
  return {
    html,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  }
}
