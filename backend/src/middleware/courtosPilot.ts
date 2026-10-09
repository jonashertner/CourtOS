import type { RequestHandler } from "express";
import { courtosPilotEnabled } from "../lib/courtosPilot";

/** Mount after Access identity verification, before domain routers/body parsing. */
export const courtosPilotMiddleware: RequestHandler = (req, res, next) => {
  if (!courtosPilotEnabled()) return next();
  // Match Express's case-insensitive routes and optional trailing slash.
  const path = req.path.toLowerCase().replace(/\/+$/, "");
  if (process.env.COURTOS_ACCESS_SELF_REGISTRATION === "true" && req.method === "POST") {
    // These routes can create persistent file copies or export artifacts
    // without entering the upload-session byte reservation. Public testers
    // can still upload through that bounded path and read/download results.
    const createsUnreservedFiles =
      /^\/projects\/[^/]+\/documents\/[^/]+$/.test(path)
      || /^\/single-documents\/[^/]+\/versions\/from-document$/.test(path)
      || /^\/single-documents\/[^/]+\/edits\/[^/]+\/(?:accept|reject)$/.test(path)
      || /^\/workflows\/[^/]+\/assets\/from-documents$/.test(path)
      || /^\/workflow-addons\/[^/]+\/import$/.test(path)
      || path === "/user/exports";
    if (createsUnreservedFiles) {
      res.status(403).json({
        code: "courtos_public_file_policy",
        detail: "Diese Kopier-, Bearbeitungs- oder Exportfunktion steht im öffentlichen Testbetrieb nicht zur Verfügung. Bitte synthetische Dateien über den begrenzten Upload hinzufügen. Vorhandene Unterlagen und Antworten können Sie weiterhin ansehen und direkt herunterladen.",
      });
      return;
    }
  }
  const forbidden = /^\/user\/(api-keys|mcp-connectors|integrations|router-models|committees|security|account)(\/|$)/.test(path)
    || /^\/models\/(?!configured(?:\/|$))/.test(path)
    || /^\/courtlistener(?:\/|$)/.test(path);
  if (forbidden) {
    res.status(403).json({ code: "courtos_pilot_policy", detail: "This setting or integration is managed by the CourtOS pilot operator." });
    return;
  }
  next();
};
