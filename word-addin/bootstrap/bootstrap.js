(function (w) {
    "use strict";
    const boot = w.CourtOSWordBoot;
    const button = w.document.getElementById("signin");
    const status = w.document.getElementById("status");
    const browser = w.document.getElementById("browser");
    let office;
    let active = null;
    let opening = false;
    let generation = 0;
    boot.setupBrowserLink();
    function fail(key, values) {
        boot.text(status, key, values);
        browser.hidden = false;
        opening = false;
        button.disabled = !office;
    }
    async function checkPane(userId) {
        boot.text(status, "checkingPane");
        try {
            const paneUserId = await boot.authUser("GET", "/api/auth/session");
            if (paneUserId !== userId) { fail("differentAccount"); return; }
            w.location.replace(boot.sameOrigin() + "/word/research");
        } catch (error) {
            fail("paneFailed", { code: boot.diagnosticCode(error) });
        }
    }
    function finish(request, userId) {
        if (active !== request) return;
        active = null;
        if (!userId) {
            fail("closed");
            return;
        }
        if (userId) {
            try { request.dialog.close(); } catch { /* Authentication is still independently checked below. */ }
        }
        void checkPane(userId);
    }
    button.addEventListener("click", () => {
        if (!office || opening || active) return;
        opening = true;
        button.disabled = true;
        boot.text(status, "separateWindow");
        let state;
        try { state = boot.newState(); boot.sameOrigin(); }
        catch { fail("unsafeWindow"); return; }
        const attempt = ++generation;
        const timeout = w.setTimeout(() => {
            if (generation !== attempt) return;
            generation += 1;
            fail("noResponse");
        }, 15000);
        try { office.context.ui.displayDialogAsync(boot.sameOrigin() + "/word-bootstrap/login.html?state=" + state,
            { height: 65, width: 40, displayInIframe: false, promptBeforeOpen: true }, result => {
                w.clearTimeout(timeout);
                if (generation !== attempt) {
                    try { result.value?.close(); } catch { /* Retired attempt cannot authenticate the pane. */ }
                    return;
                }
                if (result.status !== office.AsyncResultStatus.Succeeded || !result.value) {
                    fail("cannotOpen"); return;
                }
                const request = { state, dialog: result.value };
                active = request;
                request.dialog.addEventHandler(office.EventType.DialogMessageReceived, event => {
                    if (active !== request || event.origin !== boot.sameOrigin() || typeof event.message !== "string" || event.message.length > 1024) return;
                    let message;
                    try { message = JSON.parse(event.message); } catch { return; }
                    if (!message || message.type !== "courtos:word:authenticated" || message.state !== request.state || !boot.validUserId(message.userId)) return;
                    finish(request, message.userId);
                });
                request.dialog.addEventHandler(office.EventType.DialogEventReceived, () => finish(request, null));
            }); } catch {
                w.clearTimeout(timeout);
                generation += 1;
                fail("cannotOpen");
            }
    });
    boot.officeReady().then(value => {
        boot.sameOrigin();
        if (!value.context?.requirements?.isSetSupported("DialogApi", "1.1") || !value.context.requirements.isSetSupported("DialogOrigin", "1.1") || typeof value.context.ui?.displayDialogAsync !== "function") throw new Error("Dialog unavailable");
        office = value;
        button.disabled = false;
        boot.text(status, "besideDocument");
    }).catch(() => fail("wordUnavailable"));
})(window);
