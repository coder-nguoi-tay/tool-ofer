use obscura_js::permissions::PermissionPolicy;
use obscura_js::runtime::ObscuraJsRuntime;
use serde_json::json;
use std::sync::Arc;

/// Create an offline secure-origin runtime with a host-owned permission policy.
/// @param none No arguments.
/// @return The initialized runtime and its shared native policy.
/// @throws panic If runtime initialization fails.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn setup() -> (ObscuraJsRuntime, Arc<PermissionPolicy>) {
    let policy = Arc::new(PermissionPolicy::default());
    let mut runtime = ObscuraJsRuntime::new();
    runtime.set_dom(obscura_dom::parse_html("<!doctype html><body></body>"));
    runtime.set_url("https://permission-lifecycle.test/");
    runtime.set_permission_policy(Arc::clone(&policy));
    runtime.run_page_init();
    (runtime, policy)
}

/// End the WeakRef keep-alive job, then force a full native isolate collection.
/// @param runtime The runtime whose completed-task objects should be collected.
/// @return No value.
/// @throws panic If the task-boundary script fails.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn collect_after_task(runtime: &mut ObscuraJsRuntime) {
    // execute_script performs the public end-of-task microtask checkpoint,
    // which clears V8's kept WeakRef objects before low_memory_notification.
    runtime.execute_script("permission-gc-boundary", "void 0;").unwrap();
    runtime.collect_garbage();
}

/// Verify observer retention, native state changes and collection after the last listener.
/// @param none No arguments.
/// @return No value.
/// @throws panic If listener delivery, Web IDL branding or GC lifetime assertions fail.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test]
async fn permission_status_observers_survive_gc_and_release_after_listener_cleanup() {
    let (mut runtime, policy) = setup();
    runtime.execute_script("permission-observer-lifetimes", r#"
        /**
         * @var {Array<Array<string>>} Delivered primitive values, never status objects.
         */
        globalThis.permissionEvents = [];
        /**
         * @var {Object<string, WeakRef<PermissionStatus>>} Non-owning status probes.
         */
        globalThis.permissionRefs = {};
        /**
         * @var {AbortController} Controller retained even after listener abortion.
         */
        globalThis.permissionAbort = new AbortController();
        /**
         * @var {AbortController} Controller already aborted before registration.
         */
        globalThis.permissionAlreadyAborted = new AbortController();
        permissionAlreadyAborted.abort();
        /**
         * @var {boolean} Whether all statuses preserve their Web IDL surface.
         */
        globalThis.permissionBrandsValid = true;

        /**
         * Check the native-owned prototype, constructor and accessor brands.
         * @param {PermissionStatus} status Status returned by the native query binding.
         * @return {boolean} Whether the binding has the expected Web IDL surface.
         * @throws {Error} If reflection on the actual status unexpectedly fails.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function hasPermissionBrand(status) {
            if (Object.getPrototypeOf(status) !== PermissionStatus.prototype
                || !(status instanceof EventTarget)
                || Object.prototype.toString.call(status) !== '[object PermissionStatus]'
                || Object.getOwnPropertyNames(status).length !== 0) return false;
            for (const name of ['state', 'name', 'onchange']) {
                let rejected = false;
                try { Object.getOwnPropertyDescriptor(PermissionStatus.prototype, name).get.call({}); }
                catch (error) { rejected = error instanceof TypeError; }
                if (!rejected) return false;
            }
            let setterRejected = false, constructorRejected = false;
            try { Object.getOwnPropertyDescriptor(PermissionStatus.prototype, 'onchange').set.call({}, null); }
            catch (error) { setterRejected = error instanceof TypeError; }
            try { new PermissionStatus(); }
            catch (error) { constructorRejected = error instanceof TypeError; }
            return setterRejected && constructorRejected;
        }

        /**
         * Record a regular change callback without retaining its event target.
         * @param {Event} event Permission change event.
         * @return {void} No value.
         * @throws {TypeError} If the event does not have a permission status target.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordPermissionChange(event) {
            permissionEvents.push(['listener', event.target.name, event.target.state]);
        }

        /**
         * Record an onchange callback without retaining its event target.
         * @param {Event} event Permission change event.
         * @return {void} No value.
         * @throws {TypeError} If the event does not have a permission status target.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordPermissionProperty(event) {
            permissionEvents.push(['property', event.target.name, event.target.state]);
        }

        /**
         * Identify the replacement onchange handler in subsequent notifications.
         * @param {Event} event Permission change event.
         * @return {void} No value.
         * @throws {TypeError} If the event does not have a permission status target.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordPermissionReplacement(event) {
            permissionEvents.push(['replacement', event.target.name, event.target.state]);
        }

        /**
         * Attach each observer mode while keeping only a weak author reference.
         * @param {PermissionStatus} status Queried native status.
         * @return {void} No value.
         * @throws {TypeError} If the binding cannot register listeners on a frozen status.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function observePermission(status) {
            permissionBrandsValid = hasPermissionBrand(status) && permissionBrandsValid;
            Object.freeze(status);
            permissionRefs[status.name] = new WeakRef(status);
            switch (status.name) {
                case 'geolocation':
                    status.addEventListener('change', recordPermissionChange);
                    status.addEventListener('change', recordPermissionChange);
                    status.addEventListener('change', recordPermissionChange, true);
                    break;
                case 'notifications':
                    status.addEventListener('change', recordPermissionChange, {once: true});
                    break;
                case 'camera':
                    status.addEventListener('change', recordPermissionChange, {signal: permissionAbort.signal});
                    break;
                case 'microphone':
                    status.onchange = recordPermissionProperty;
                    break;
                case 'clipboard-read':
                    status.addEventListener('unrelated', recordPermissionChange);
                    break;
                case 'clipboard-write':
                    status.addEventListener('change', recordPermissionChange, {signal: permissionAlreadyAborted.signal});
                    break;
            }
        }

        for (const name of ['geolocation', 'notifications', 'camera', 'microphone',
                            'midi', 'clipboard-read', 'clipboard-write']) {
            navigator.permissions.query({name}).then(observePermission);
        }
    "#).unwrap();
    collect_after_task(&mut runtime);
    assert_eq!(runtime.evaluate(r#"[permissionBrandsValid,
        permissionRefs.geolocation.deref() !== undefined,
        permissionRefs.notifications.deref() !== undefined,
        permissionRefs.camera.deref() !== undefined,
        permissionRefs.microphone.deref() !== undefined,
        permissionRefs.midi.deref() === undefined,
        permissionRefs['clipboard-read'].deref() === undefined,
        permissionRefs['clipboard-write'].deref() === undefined]"#).unwrap(),
        json!([true, true, true, true, true, true, true, true]));

    for name in ["geolocation", "notifications", "camera", "microphone"] {
        policy.set(Some("https://permission-lifecycle.test".into()), name, "granted").unwrap();
    }
    assert_eq!(runtime.evaluate("[permissionEvents.length, permissionRefs.geolocation.deref().state]").unwrap(),
        json!([0, "granted"]), "state reads native policy before the queued event runs");
    runtime.run_event_loop_bounded(100).await.unwrap();
    assert_eq!(runtime.evaluate("permissionEvents").unwrap(), json!([
        ["listener", "geolocation", "granted"],
        ["listener", "geolocation", "granted"],
        ["listener", "notifications", "granted"],
        ["listener", "camera", "granted"],
        ["property", "microphone", "granted"],
    ]));
    collect_after_task(&mut runtime);
    assert_eq!(runtime.evaluate("permissionRefs.notifications.deref() === undefined").unwrap(),
        json!(true), "a once listener must release its status after dispatch");

    runtime.execute_script("permission-partial-listener-cleanup", r#"
        permissionRefs.geolocation.deref().removeEventListener('change', recordPermissionChange);
        permissionAbort.abort();
        permissionRefs.microphone.deref().onchange = recordPermissionReplacement;
    "#).unwrap();
    collect_after_task(&mut runtime);
    assert_eq!(runtime.evaluate(r#"[
        permissionRefs.geolocation.deref() !== undefined,
        permissionRefs.camera.deref() === undefined,
        permissionRefs.microphone.deref() !== undefined]"#).unwrap(), json!([true, true, true]),
        "one capture listener and a replacement property handler remain active; abortion releases its status");

    for name in ["geolocation", "notifications", "camera", "microphone"] {
        policy.set(Some("https://permission-lifecycle.test".into()), name, "denied").unwrap();
    }
    runtime.run_event_loop_bounded(100).await.unwrap();
    assert_eq!(runtime.evaluate("permissionEvents.slice(5)").unwrap(), json!([
        ["listener", "geolocation", "denied"],
        ["replacement", "microphone", "denied"],
    ]));
    runtime.execute_script("permission-property-cleanup", "permissionRefs.microphone.deref().onchange = null;").unwrap();
    collect_after_task(&mut runtime);
    assert_eq!(runtime.evaluate("[permissionRefs.microphone.deref() === undefined, permissionRefs.geolocation.deref() !== undefined]").unwrap(),
        json!([true, true]), "clearing onchange releases only its own status");
    runtime.execute_script("permission-last-listener-cleanup",
        "permissionRefs.geolocation.deref().removeEventListener('change', recordPermissionChange, true);").unwrap();
    collect_after_task(&mut runtime);
    assert_eq!(runtime.evaluate("permissionRefs.geolocation.deref() === undefined").unwrap(),
        json!(true), "removing the last listener must release the status");
    policy.reset();
    runtime.run_event_loop_bounded(100).await.unwrap();
    assert_eq!(runtime.evaluate("permissionEvents.length").unwrap().as_f64(), Some(7.0));
}

/// Verify dispatch-time listener mutations retain only observers needed by the next change.
/// @param none No arguments.
/// @return No value.
/// @throws panic If reentrant once, dispatch mutation, notification or GC assertions fail.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test]
async fn permission_dispatch_mutations_and_throwing_once_listeners_preserve_gc_lifetimes() {
    let (mut runtime, policy) = setup();
    runtime.execute_script("permission-dispatch-mutations", r#"
        /**
         * @var {Array<Array<string|number>>} Primitive evidence from dispatched callbacks.
         */
        globalThis.dispatchPermissionEvents = [];
        /**
         * @var {Map<string, WeakRef<PermissionStatus>>} Non-owning lifetime probes.
         */
        globalThis.dispatchPermissionRefs = new Map();
        /**
         * @var {Map<string, AbortController>} Controllers kept after in-dispatch abortion.
         */
        globalThis.dispatchPermissionControllers = new Map();
        /**
         * @var {number} Once callback count, allowing exactly one re-registration.
         */
        globalThis.dispatchPermissionOnceCalls = 0;

        /**
         * Re-register once for the next change before throwing from each delivery.
         * @param {Event} event Permission change event.
         * @return {never} Always throws after recording the current notification.
         * @throws {string} Intentional primitive failure without a stack retaining the status.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function rearmAndThrowPermissionOnce(event) {
            const status = event.currentTarget;
            dispatchPermissionEvents.push(['once', status.name, status.state, ++dispatchPermissionOnceCalls]);
            if (dispatchPermissionOnceCalls === 1) {
                status.addEventListener('change', rearmAndThrowPermissionOnce, {once: true});
            }
            throw 'Intentional reentrant permission once callback failure';
        }

        /**
         * Detect accidental invocation of a listener aborted earlier in the same dispatch.
         * @param {Event} event Permission change event.
         * @return {void} No value.
         * @throws {TypeError} If the event has no permission status target.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordAbortedDuringPermissionDispatch(event) {
            dispatchPermissionEvents.push(['unexpected-aborted', event.currentTarget.name]);
        }

        /**
         * Detect accidental invocation of a listener removed earlier in the same dispatch.
         * @param {Event} event Permission change event.
         * @return {void} No value.
         * @throws {TypeError} If the event has no permission status target.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordRemovedDuringPermissionDispatch(event) {
            dispatchPermissionEvents.push(['unexpected-removed', event.currentTarget.name]);
        }

        /**
         * Remove the current listener and abort/remove later entries during dispatch.
         * @param {Event} event Permission change event.
         * @return {void} No value.
         * @throws {TypeError} If the target or its abort controller is unavailable.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function mutatePermissionListenersDuringDispatch(event) {
            const status = event.currentTarget;
            dispatchPermissionEvents.push(['mutate', status.name, status.state]);
            status.removeEventListener('change', mutatePermissionListenersDuringDispatch);
            // A default AbortError captures the dispatch receiver in its V8 stack.
            // Keep the controllers rooted without retaining statuses through that reason.
            dispatchPermissionControllers.get(status.name).abort('permission dispatch cleanup');
            status.removeEventListener('change', recordRemovedDuringPermissionDispatch);
        }

        /**
         * Observe the surviving listener through the next change, then remove it.
         * @param {Event} event Permission change event.
         * @return {void} No value.
         * @throws {TypeError} If the event has no permission status target.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordSurvivingPermissionListener(event) {
            const status = event.currentTarget;
            dispatchPermissionEvents.push(['survivor', status.name, status.state]);
            if (status.state === 'denied') {
                status.removeEventListener('change', recordSurvivingPermissionListener);
            }
        }

        /**
         * Install bounded mutation cases while keeping no strong author status reference.
         * @param {PermissionStatus} status Queried native status.
         * @return {void} No value.
         * @throws {TypeError} If the binding cannot register observers on a frozen status.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function observePermissionDispatchMutations(status) {
            Object.freeze(status);
            dispatchPermissionRefs.set(status.name, new WeakRef(status));
            if (status.name === 'geolocation') {
                status.addEventListener('change', rearmAndThrowPermissionOnce, {once: true});
                return;
            }
            const controller = new AbortController();
            dispatchPermissionControllers.set(status.name, controller);
            status.addEventListener('change', mutatePermissionListenersDuringDispatch);
            status.addEventListener('change', recordAbortedDuringPermissionDispatch, {signal: controller.signal});
            status.addEventListener('change', recordRemovedDuringPermissionDispatch);
            if (status.name === 'camera') {
                status.addEventListener('change', recordSurvivingPermissionListener);
            }
        }

        for (const name of ['geolocation', 'notifications', 'camera']) {
            navigator.permissions.query({name}).then(observePermissionDispatchMutations);
        }
    "#).unwrap();
    collect_after_task(&mut runtime);
    assert_eq!(runtime.evaluate(r#"[
        dispatchPermissionRefs.get('geolocation').deref() !== undefined,
        dispatchPermissionRefs.get('notifications').deref() !== undefined,
        dispatchPermissionRefs.get('camera').deref() !== undefined]"#).unwrap(), json!([true, true, true]));

    for name in ["geolocation", "notifications", "camera"] {
        policy.set(Some("https://permission-lifecycle.test".into()), name, "granted").unwrap();
    }
    runtime.run_event_loop_bounded(100).await.unwrap();
    assert_eq!(runtime.evaluate("dispatchPermissionEvents").unwrap(), json!([
        ["once", "geolocation", "granted", 1],
        ["mutate", "notifications", "granted"],
        ["mutate", "camera", "granted"],
        ["survivor", "camera", "granted"],
    ]), "re-registered once waits for the next dispatch; aborted/removed entries are skipped");
    collect_after_task(&mut runtime);
    assert_eq!(runtime.evaluate(r#"[
        dispatchPermissionRefs.get('geolocation').deref() !== undefined,
        dispatchPermissionRefs.get('notifications').deref() === undefined,
        dispatchPermissionRefs.get('camera').deref() !== undefined,
        dispatchPermissionControllers.get('notifications').signal.aborted,
        dispatchPermissionControllers.get('camera').signal.aborted,
        dispatchPermissionControllers.get('notifications').signal.reason === 'permission dispatch cleanup',
        dispatchPermissionControllers.get('camera').signal.reason === 'permission dispatch cleanup']"#).unwrap(),
        json!([true, true, true, true, true, true, true]),
        "throwing after re-registration and removing other listeners must preserve active observers only");

    for name in ["geolocation", "notifications", "camera"] {
        policy.set(Some("https://permission-lifecycle.test".into()), name, "denied").unwrap();
    }
    runtime.run_event_loop_bounded(100).await.unwrap();
    assert_eq!(runtime.evaluate("dispatchPermissionEvents.slice(4)").unwrap(), json!([
        ["once", "geolocation", "denied", 2],
        ["survivor", "camera", "denied"],
    ]));
    collect_after_task(&mut runtime);
    assert_eq!(runtime.evaluate(r#"[
        dispatchPermissionRefs.get('geolocation').deref() === undefined,
        dispatchPermissionRefs.get('notifications').deref() === undefined,
        dispatchPermissionRefs.get('camera').deref() === undefined]"#).unwrap(), json!([true, true, true]),
        "the final throwing once delivery and in-dispatch self-removal release their statuses");
    policy.reset();
    runtime.run_event_loop_bounded(100).await.unwrap();
    assert_eq!(runtime.evaluate("[dispatchPermissionOnceCalls, dispatchPermissionEvents.length]").unwrap(),
        json!([2, 6]));
}

/// Verify terminal denial removes each watch before callback, throw or reentrancy.
/// @param none No arguments.
/// @return No value.
/// @throws panic If denial cleanup, callback delivery or cancellation assertions fail.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test]
async fn denied_geolocation_watches_retire_before_callbacks_and_preserve_cancellation() {
    let (mut runtime, policy) = setup();
    policy.set(Some("https://permission-lifecycle.test".into()), "geolocation", "denied").unwrap();
    assert!(runtime.set_geolocation(Some((12.0, 34.0, 1.0))));
    runtime.execute_script("denied-geolocation-watches", r#"
        /**
         * @var {Array<string>} Callback evidence without captured position objects.
         */
        globalThis.geolocationEvents = [];
        /**
         * @var {Array<number>} Watch IDs, including the reentrant watch at index four.
         */
        globalThis.deniedWatchIds = [];
        /**
         * @var {Array<number>} Public clearTimeout calls made by clearWatch.
         */
        globalThis.geolocationCancellations = [];
        /**
         * @var {Function} Original timeout cancellation function.
         */
        globalThis.originalGeolocationClearTimeout = globalThis.clearTimeout;

        /**
         * Observe watch map membership through its existing public cancellation path.
         * @param {number} id Timer handle selected by clearWatch.
         * @return {void} No value.
         * @throws {Error} If the original timeout cancellation fails.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordGeolocationCancellation(id) {
            geolocationCancellations.push(id);
            originalGeolocationClearTimeout(id);
        }
        globalThis.clearTimeout = recordGeolocationCancellation;

        /**
         * Record an unexpected position delivered despite a native permission denial.
         * @param {object} position Unexpected native position.
         * @return {void} No value.
         * @throws {never} Does not throw.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordUnexpectedPosition(position) {
            geolocationEvents.push('unexpected-position');
        }

        /**
         * Verify that the reentrant watch is independently terminal before its callback.
         * @param {object} error Native permission-denied error.
         * @return {void} No value.
         * @throws {Error} If public watch cancellation fails.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordReentrantDenial(error) {
            geolocationEvents.push('reentrant:' + error.code);
            navigator.geolocation.clearWatch(deniedWatchIds[4]);
        }

        /**
         * Inspect cleanup during callback and create a separate watch reentrantly.
         * @param {object} error Native permission-denied error.
         * @return {void} No value.
         * @throws {Error} If public watch registration or cancellation fails.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordTerminalDenial(error) {
            geolocationEvents.push('terminal:' + error.code);
            const before = geolocationCancellations.length;
            navigator.geolocation.clearWatch(deniedWatchIds[0]);
            geolocationEvents.push('retired-before-callback:' + (geolocationCancellations.length === before));
            deniedWatchIds.push(navigator.geolocation.watchPosition(recordUnexpectedPosition, recordReentrantDenial));
        }

        /**
         * Throw before any caller cleanup to expose stale terminal watch entries.
         * @param {object} error Native permission-denied error.
         * @return {never} Always throws after recording the denial.
         * @throws {Error} Intentional caller failure.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function throwAfterGeolocationDenial(error) {
            geolocationEvents.push('throwing:' + error.code);
            throw new Error('Intentional terminal watch callback failure');
        }

        /**
         * Detect accidental delivery after clearWatch canceled a pending task.
         * @param {object} error Native position error.
         * @return {void} No value.
         * @throws {never} Does not throw.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordCancelledDenial(error) {
            geolocationEvents.push('cancelled:' + error.code);
        }

        /**
         * Confirm that the shared delivery helper still supports one-shot errors.
         * @param {object} error Native permission-denied error.
         * @return {void} No value.
         * @throws {never} Does not throw.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordOneShotDenial(error) {
            geolocationEvents.push('one-shot:' + error.code);
        }

        deniedWatchIds.push(navigator.geolocation.watchPosition(recordUnexpectedPosition, recordTerminalDenial));
        deniedWatchIds.push(navigator.geolocation.watchPosition(recordUnexpectedPosition, throwAfterGeolocationDenial));
        deniedWatchIds.push(navigator.geolocation.watchPosition(recordUnexpectedPosition));
        deniedWatchIds.push(navigator.geolocation.watchPosition(recordUnexpectedPosition, recordCancelledDenial));
        navigator.geolocation.clearWatch(deniedWatchIds[3]);
        navigator.geolocation.getCurrentPosition(recordUnexpectedPosition, recordOneShotDenial);
    "#).unwrap();
    assert_eq!(runtime.evaluate("[geolocationEvents.length, geolocationCancellations.length]").unwrap(),
        json!([0, 1]), "watch errors must remain asynchronous and pending watches must cancel");
    runtime.run_event_loop_bounded(100).await.unwrap();
    assert_eq!(runtime.evaluate("geolocationEvents.slice().sort()").unwrap(), json!([
        "one-shot:1", "reentrant:1", "retired-before-callback:true", "terminal:1", "throwing:1",
    ]));
    runtime.execute_script("terminal-watch-cleanup-probe", r#"
        for (const id of deniedWatchIds) navigator.geolocation.clearWatch(id);
    "#).unwrap();
    // A stale watch entry would call the public clearTimeout wrapper even after
    // its timer fired. This detects numeric map-entry leaks without test hooks.
    assert_eq!(runtime.evaluate("geolocationCancellations.length").unwrap().as_f64(), Some(1.0),
        "denied, throwing, silent and reentrant terminal watches must already be absent");
    runtime.run_event_loop_bounded(100).await.unwrap();
    assert_eq!(runtime.evaluate("geolocationEvents.length").unwrap().as_f64(), Some(5.0));
}

/// Preserve the existing one-delivery watch behavior using native emulated coordinates.
/// @param none No arguments.
/// @return No value.
/// @throws panic If native positions, task cancellation or single delivery assertions fail.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[tokio::test]
async fn granted_geolocation_watches_remain_single_delivery_and_cancellable() {
    let (mut runtime, policy) = setup();
    policy.set(Some("https://permission-lifecycle.test".into()), "geolocation", "granted").unwrap();
    assert!(runtime.set_geolocation(Some((12.0, 34.0, 1.0))));
    runtime.execute_script("granted-geolocation-watches", r#"
        /**
         * @var {Array<Array<number>>} Native coordinates delivered to active requests.
         */
        globalThis.nativePositions = [];
        /**
         * @var {Array<number>} Unexpected position error codes.
         */
        globalThis.nativePositionErrors = [];
        /**
         * Record only native coordinates rather than retaining the callback argument.
         * @param {object} position Native geolocation result.
         * @return {void} No value.
         * @throws {TypeError} If the native result has no coordinates.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordNativePosition(position) {
            nativePositions.push([position.coords.latitude, position.coords.longitude]);
        }
        /**
         * Record an unexpected error on a granted geolocation request.
         * @param {object} error Native position error.
         * @return {void} No value.
         * @throws {never} Does not throw.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-19
         */
        function recordNativePositionError(error) {
            nativePositionErrors.push(error.code);
        }
        /**
         * @var {number} Watch allowed to deliver its existing single result.
         */
        globalThis.deliveredNativeWatch = navigator.geolocation.watchPosition(recordNativePosition, recordNativePositionError);
        /**
         * @var {number} Watch canceled before its queued native result.
         */
        globalThis.cancelledNativeWatch = navigator.geolocation.watchPosition(recordNativePosition, recordNativePositionError);
        navigator.geolocation.clearWatch(cancelledNativeWatch);
        navigator.geolocation.getCurrentPosition(recordNativePosition, recordNativePositionError);
    "#).unwrap();
    assert_eq!(runtime.evaluate("nativePositions.length").unwrap().as_f64(), Some(0.0));
    runtime.run_event_loop_bounded(100).await.unwrap();
    // Compare numeric coordinates, not serde_json's integer/float representation.
    let (positions, errors): (Vec<[f64; 2]>, Vec<serde_json::Value>) = serde_json::from_value(
        runtime.evaluate("[nativePositions, nativePositionErrors]").unwrap()).unwrap();
    assert_eq!(positions, vec![[12.0, 34.0], [12.0, 34.0]],
        "exactly two active requests must receive the native coordinates");
    assert!(errors.is_empty(), "granted requests must report no errors: {errors:?}");
    policy.set(Some("https://permission-lifecycle.test".into()), "geolocation", "denied").unwrap();
    runtime.run_event_loop_bounded(100).await.unwrap();
    let counts: (f64, f64) = serde_json::from_value(
        runtime.evaluate("[nativePositions.length, nativePositionErrors.length]").unwrap()).unwrap();
    assert_eq!(counts, (2.0, 0.0), "an existing watch must not gain a polling loop or extra delivery");
    runtime.execute_script("granted-watch-cleanup", "navigator.geolocation.clearWatch(deliveredNativeWatch);").unwrap();
}
