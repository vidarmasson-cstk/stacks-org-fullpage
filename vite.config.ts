import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Contentstack loads the app in an iframe from the hosting URL you set in
// Developer Hub. Port 3000 matches Developer Hub's default (http://localhost:3000).
export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  preview: { port: 3000 },
});
