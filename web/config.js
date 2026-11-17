// Conexión con la base de datos de la casa (Supabase).
// La clave "publishable" es pública a propósito: los permisos los controla la base de datos (RLS).
// MODO: 'compartido' usa Supabase; 'prueba' guarda todo solo en el móvil.
export const MODO = 'compartido';
export const SUPABASE_URL = 'https://uunbrslndzfmarzinlhe.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_WfH2H1LLKMXvYLOkjao4XQ_GSpVZulZ';
export const VERSION = '0.3.1 (lista separada y tiques de los tres súper)';
// Clave pública para los avisos en el móvil (la privada solo la tiene Supabase).
export const VAPID_PUBLICA = 'BAbYwIyw7gpe7yoJlViO5bpF2pEOdH4OTWHP-vdmybcPxpD92XusqlV6-Q-AhYZP1iBk8ZNDQq92LZDfovfXqNI';
