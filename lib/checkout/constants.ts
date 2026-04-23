export const FREE_SHIPPING_THRESHOLD = 250;
export const COMPLIMENTARY_SHIPPING_ENABLED = true;

export const NOWPAYMENTS_BASE_URL = 'https://api.nowpayments.io/v1/';

export const SHIELDCLIMB_API_BASE_URL =
  process.env.SHIELDCLIMB_API_BASE_URL || 'https://api.shieldclimb.com';
export const SHIELDCLIMB_PAYMENT_BASE_URL =
  process.env.SHIELDCLIMB_PAYMENT_BASE_URL || 'https://payment.shieldclimb.com';
export const SHIELDCLIMB_PUBLIC_POLLING_ID = 'shieldclimb';

export const DEFAULT_PAYMENT_CURRENCIES = ['btc', 'usdcmatic', 'eth', 'sol', 'ltc', 'usdttrc20', 'trx'] as const;

export const TERMINAL_PAYMENT_STATUSES = new Set([
  'finished',
  'failed',
  'expired',
  'refunded',
  'cancelled',
  'replaced',
]);

export const SHIELDCLIMB_TERMINAL_STATUSES = new Set(['paid']);
export const ACCOUNT_ORDER_HISTORY_STATUSES = ['finished', 'paid', 'refunded'] as const;

export const QUICK_PAYMENT_CURRENCIES = (() => {
  const raw = process.env.NEXT_PUBLIC_NOWPAYMENTS_QUICK_CURRENCIES || '';
  const parsed = raw
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  const currencies = parsed.length > 0 ? parsed : [...DEFAULT_PAYMENT_CURRENCIES];
  const withoutUsdcMatic = currencies.filter(currency => currency !== 'usdcmatic');
  const promotedCurrencies = [...withoutUsdcMatic];
  promotedCurrencies.splice(Math.min(1, promotedCurrencies.length), 0, 'usdcmatic');

  return promotedCurrencies;
})();

const SHIPPING_COUNTRY_CODES = (
  'AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AS,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BV,BW,BY,BZ,CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GU,GW,GY,HK,HM,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PN,PR,PS,PT,PW,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,TC,TD,TF,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,UM,US,UY,UZ,VA,VC,VE,VG,VI,VN,VU,WF,WS,XK,YE,YT,ZA,ZM,ZW'
).split(',');

export const SHIPPING_COUNTRIES = SHIPPING_COUNTRY_CODES.map(code => ({
  code,
  label: code,
}));

export function isTerminalPaymentStatus(status?: string | null) {
  if (!status) return false;
  return TERMINAL_PAYMENT_STATUSES.has(status.toLowerCase()) || SHIELDCLIMB_TERMINAL_STATUSES.has(status.toLowerCase());
}

export function isShieldClimbTerminalStatus(status?: string | null) {
  if (!status) return false;
  return SHIELDCLIMB_TERMINAL_STATUSES.has(status.toLowerCase());
}

export function isAccountOrderHistoryStatus(status?: string | null) {
  if (!status) return false;
  return ACCOUNT_ORDER_HISTORY_STATUSES.includes(status.toLowerCase() as (typeof ACCOUNT_ORDER_HISTORY_STATUSES)[number]);
}
