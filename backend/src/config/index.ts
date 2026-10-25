export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  veriphoneApiKey: process.env.VERIPHONE_API_KEY || "AD445244531A4D7FB4C9D09609D7B87B",
  veriphoneUrl: process.env.VERIPHONE_URL || "https://api.veriphone.io/v2/verify",
};
