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
        boot.text(w.document.getElementById("status"), "loginFailed");
    });
})(window);
