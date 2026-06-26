import type { Env } from '../config/env.js';
export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}
class ConsoleSmsProvider implements SmsProvider {
  async send(phone: string, message: string) {
    console.log(`[SMS] To: ${phone}, Body: ${message}`);
  }
}
class DummySmsProvider implements SmsProvider {
  async send(_phone: string, _message: string) {}
}
function createSmsProvider(env: Env): SmsProvider {
  const type = env.SMS_PROVIDER ?? 'console';
  if (type === 'dummy') {
    return new DummySmsProvider();
  }
  return new ConsoleSmsProvider();
}
export function createSmsSender(env: Env) {
  const provider = createSmsProvider(env);
  return {
    async sendCode(phone: string, code: string): Promise<void> {
      const message = `Folio Mind: ваш код подтверждения ${code}`;
      await provider.send(phone, message);
    },
  };
}
