/* This file and its HTML must remain behind Cloudflare Access. */
(function (w) {
    "use strict";
    const boot = w.CourtOSWordBoot;
    const button = w.document.getElementById("confirm");
    const status = w.document.getElementById("status");
    let office;
    let state;
    let busy = false;
    boot.setupBrowserLink();
    boot.officeReady().then(value => {
        boot.sameOrigin();
        state = boot.stateFromUrl();
        if (!state || typeof value.context?.ui?.messageParent !== "function") throw new Error("Dialog unavailable");
        office = value;
        button.disabled = false;
        boot.text(status, "confirmSession");
    }).catch(() => { boot.text(status, "cannotReturn"); });
    button.addEventListener("click", async () => {
        if (!office || !state || busy) return;
        busy = true;
        button.disabled = true;
        boot.text(status, "confirming");
        let stage = "D1";
        try {
            const signedInUserId = await boot.authUser("POST", "/api/auth/cloudflare");
            stage = "D2";
            const sessionUserId = await boot.authUser("GET", "/api/auth/session");
            if (sessionUserId !== signedInUserId) {
                stage = "D3";
                throw new Error("Session mismatch");
            }
            stage = "D4";
            office.context.ui.messageParent(JSON.stringify({ type: "courtos:word:authenticated", state, userId: sessionUserId }), { targetOrigin: boot.sameOrigin() });
            boot.text(status, "confirmed");
        } catch (error) {
            busy = false;
            button.disabled = false;
            const reason = stage === "D3" ? "KONTO" : stage === "D4" ? "RUECKGABE" : boot.diagnosticCode(error);
            boot.text(status, "failed", { code: stage + "-" + reason });
        }
    });
})(window);
