// Налаштування SashaFit. Заповни три рядки нижче.
// Усе тут публічне, секретних ключів у цьому файлі бути не повинно.
window.SASHAFIT = {
  // Supabase: Project Settings -> API -> Project URL
  SUPABASE_URL: "https://iqxlldcqnqsbttrvgyjk.supabase.co/rest/v1/",

  // Supabase: Project Settings -> API -> публічний ключ (anon або publishable).
  // Ключ service_role / secret сюди НЕ вставляти.
  SUPABASE_ANON_KEY: "ВСТАВ-ПУБЛІЧНИЙ-КЛЮЧ",

  // Посилання-запрошення для клієнтів: https://t.me/USERNAME_БОТА/КОРОТКА_НАЗВА?startapp=
  // КОРОТКА_НАЗВА задається в BotFather при створенні застосунку командою /newapp.
  // Код клієнта додається в кінець автоматично.
  INVITE_BASE_URL: "https://t.me/USERNAME_БОТА/КОРОТКА_НАЗВА?startapp="
};
