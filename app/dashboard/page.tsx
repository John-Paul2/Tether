import type { Metadata } from "next";
import { connection } from "next/server";
import { aiEnabled, aiModels } from "@/lib/ai";
import { getTetherData } from "@/lib/tether-data";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = {
  title: "Tether · Payment-event doctor",
};

export default async function DashboardPage() {
  // Live SQLite + PayPal drift snapshot: render per request, not at build time.
  await connection();
  const data = await getTetherData();

  // Only flat rows and model ids reach the client; PayPal, Gemini, and OpenAI keys stay on the server.
  return (
    <Dashboard
      data={data}
      licenseKey={process.env.AG_STUDIO}
      aiModels={aiEnabled() ? aiModels() : undefined}
    />
  );
}
