(function (w) {
    "use strict";
    const boot = w.CourtOSWordBoot;
    boot.setupBrowserLink();
    boot.officeReady().then(() => {
        const state = boot.stateFromUrl();
        if (!state) throw new Error("Invalid request");
        // Fixed protected destination. The random state carries no credentials or user text.
        w.location.replace(boot.sameOrigin() + "/word-auth/complete.html?state=" + state);
    }).catch(() => {
        w.document.getElementById("status").textContent = "Die Anmeldung konnte nicht geöffnet werden. Schliessen Sie dieses Fenster und versuchen Sie es erneut.";
    });
})(window);
