export interface GpsFix {
  lat: number;
  lng: number;
  accuracyMeters: number;
  isLowAccuracy: boolean;
  source: 'gps' | 'network';
}

export type GpsFailureReason =
  | 'unsupported'
  | 'insecure_context'
  | 'permission_denied'
  | 'timeout'
  | 'unavailable';

export type GpsOutcome =
  | { ok: true; fix: GpsFix }
  | { ok: false; reason: GpsFailureReason; message: string };

export interface GpsRequestOptions {
  /** Called immediately whenever a better coordinate fix arrives during active watch. */
  onRefine?: (fix: GpsFix) => void;
  /** Maximum time to wait for a refined GPS lock in milliseconds. Default 10000. */
  maxWaitMs?: number;
}

function toGpsFix(pos: GeolocationPosition, source: 'gps' | 'network'): GpsFix {
  const accuracy = Number.isFinite(pos.coords.accuracy)
    ? Math.round(pos.coords.accuracy)
    : 5000;
  return {
    lat: Number(pos.coords.latitude.toFixed(6)),
    lng: Number(pos.coords.longitude.toFixed(6)),
    accuracyMeters: accuracy,
    isLowAccuracy: accuracy > 500,
    source,
  };
}

function buildBlockedMessage(): string {
  const inIframe = typeof window !== 'undefined' && window.self !== window.top;
  return inIframe
    ? 'Location permission is blocked in this preview frame or browser. Allow Location in the site settings, open the app in a new tab, or search your Karnataka area below.'
    : 'Location permission is blocked in your browser. Click the site lock/settings icon in the address bar to allow Location, or search your area below.';
}

/**
 * Reliable browser GPS locator:
 * 1. Checks secure context and Permissions API state so denied permissions surface immediately.
 * 2. Uses watchPosition (high accuracy, maximumAge: 0) briefly to avoid stale/coarse first-ping IP jumps.
 * 3. Falls back cleanly to network/Wi-Fi geolocation if hardware GPS times out indoors.
 */
export function requestBestCurrentPosition(options: GpsRequestOptions = {}): {
  promise: Promise<GpsOutcome>;
  cancel: () => void;
} {
  let watchId: number | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let hardTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let resolved = false;

  const cleanup = () => {
    if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    if (hardTimer !== null) {
      clearTimeout(hardTimer);
      hardTimer = null;
    }
  };

  const promise = new Promise<GpsOutcome>((resolve) => {
    const finish = (outcome: GpsOutcome) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(outcome);
    };

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      finish({
        ok: false,
        reason: 'insecure_context',
        message: 'GPS requires HTTPS. Search any Karnataka town, road, or landmark below or tap the map.',
      });
      return;
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      finish({
        ok: false,
        reason: 'unsupported',
        message: 'GPS is not supported in this browser. Search any Karnataka place below or tap the map.',
      });
      return;
    }

    const maxWaitMs = options.maxWaitMs ?? 9500;
    let bestFix: GpsFix | null = null;

    const tryNetworkFallback = () => {
      if (cancelled || resolved) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix = toGpsFix(pos, 'network');
          if (!bestFix || fix.accuracyMeters < bestFix.accuracyMeters) {
            bestFix = fix;
            options.onRefine?.(fix);
          }
          finish({ ok: true, fix: bestFix });
        },
        (fallbackErr) => {
          if (bestFix) {
            finish({ ok: true, fix: bestFix });
            return;
          }
          if (fallbackErr.code === fallbackErr.PERMISSION_DENIED) {
            finish({
              ok: false,
              reason: 'permission_denied',
              message: buildBlockedMessage(),
            });
          } else if (fallbackErr.code === fallbackErr.TIMEOUT) {
            finish({
              ok: false,
              reason: 'timeout',
              message: 'GPS timed out (weak indoor signal). Search your locality below or tap anywhere on the map.',
            });
          } else {
            finish({
              ok: false,
              reason: 'unavailable',
              message: 'Device location unavailable right now. Search any Karnataka area below or tap the map.',
            });
          }
        },
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 30000 }
      );
    };

    const startWatch = () => {
      if (cancelled || resolved) return;

      hardTimer = setTimeout(() => {
        if (bestFix) {
          finish({ ok: true, fix: bestFix });
        } else {
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
          tryNetworkFallback();
        }
      }, maxWaitMs);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled || resolved) return;
          const nextFix = toGpsFix(pos, pos.coords.accuracy <= 150 ? 'gps' : 'network');

          if (!bestFix || nextFix.accuracyMeters < bestFix.accuracyMeters) {
            bestFix = nextFix;
            options.onRefine?.(nextFix);
          }

          // Good hardware GPS lock achieved — return immediately
          if (bestFix.accuracyMeters <= 60) {
            finish({ ok: true, fix: bestFix });
            return;
          }

          // Wait briefly (up to 2.5s) after a coarse first fix in case accurate GPS arrives
          if (settleTimer === null) {
            settleTimer = setTimeout(() => {
              if (bestFix) {
                finish({ ok: true, fix: bestFix });
              }
            }, 2500);
          }
        },
        (err) => {
          if (cancelled || resolved) return;
          if (err.code === err.PERMISSION_DENIED) {
            finish({
              ok: false,
              reason: 'permission_denied',
              message: buildBlockedMessage(),
            });
            return;
          }
          if (bestFix) {
            finish({ ok: true, fix: bestFix });
            return;
          }
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
          tryNetworkFallback();
        },
        { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
      );
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (cancelled || resolved) return;
          if (status.state === 'denied') {
            finish({
              ok: false,
              reason: 'permission_denied',
              message: buildBlockedMessage(),
            });
          } else {
            startWatch();
          }
        })
        .catch(() => startWatch());
    } else {
      startWatch();
    }
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      cleanup();
    },
  };
}
