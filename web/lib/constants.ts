export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const suggestions = [
  "Como o Fio me ajuda a vender mais?",
  "Tenho um negócio pequeno. Por onde eu começo?",
  "O que o Fio faz com os clientes que somem?",
  "Como funciona na prática? Me conta um exemplo.",
];
