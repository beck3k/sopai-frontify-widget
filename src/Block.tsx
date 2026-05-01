import { type Color, useBlockSettings } from '@frontify/app-bridge';
import { type BlockProps } from '@frontify/guideline-blocks-settings';
import { type CSSProperties, type FC, useCallback, useEffect, useRef, useState } from 'react';

import { authenticate, checkWidgetAccess } from './api';
import { env } from './env';
import { useAuth } from './useAuth';

type Settings = {
    color: Color;
    hmacKey?: string;
};

const STORAGE_KEY = 'sopai_frontify_widget_open_v1';
const ORG_SLUG_KEY = 'sopai_org_slug_v1';
const ACCESS_KEY_PREFIX = 'sopai_widget_access_';

const LOGO_PATH =
    'M 35.5222,11.8848 C 35.4645,8.06085 32.6717,4.16743 28.4042,1.97529 24.9078,0.177367 21.3544,0.00772536 19.1337,1.5491 17.2496,2.85201 15.8389,5.11784 14.7251,7.71948 9.41475,6.9999 5.72226,7.81334 3.4453,10.228 -0.288214,13.8648 -1.02657,19.648 1.42211,26.0853 3.82421,32.4121 8.57419,37.3165 12.4711,37.4958 12.5406,37.5 12.6157,37.5 12.688,37.5 c 1.889,0 3.4499,-1.1499 4.5428,-3.4109 0.0473,-0.1092 0.1516,-0.5263 0.1815,-0.6174 0.9907,-3.0723 0.8085,-8.065 0.5847,-13.376 -0.08,-1.8821 -0.1606,-3.7815 -0.1829,-5.5912 4.4316,1.793 8.6684,3.3511 11.9174,3.3511 1.1923,0.0473 2.3731,-0.2483 3.4025,-0.8517 1.4503,-0.9198 2.252,-2.6427 2.3882,-5.1191 z M 5.09931,14.266 c -0.03824,-1.3905 0.37057,-2.3381 1.21809,-2.8234 1.28274,-0.7328 4.102,0.1661 6.7162,1.1541 -0.6814,2.4271 -1.2028,4.8591 -1.636,6.9206 -0.6257,2.9812 -1.1743,5.5571 -1.76732,5.5787 C 7.10095,21.2832 5.17579,17.0547 5.09931,14.266 Z M 20.7669,3.36302 C 21.088,3.25724 21.4286,3.22413 21.764,3.2661 c 0.3355,0.04196 0.6575,0.15795 0.9426,0.33957 2.035,1.08181 4.0673,4.19864 4.7048,7.14583 C 26.5396,10.5214 25.6566,10.2871 24.7215,10.027 22.5863,9.43537 20.3761,8.82216 18.1471,8.33687 18.5247,5.85412 19.2776,3.98458 20.7669,3.36302 Z';

const getWidgetStyles = (glowColor: string) => `
    #sopai-widget-root {
        z-index: 2147483647 !important;
    }
    @keyframes sopai-bubble-in {
        0% { opacity: 0; transform: translateY(16px) scale(0.92); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes sopai-bubble-out {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(16px) scale(0.92); }
    }
    @keyframes sopai-spin {
        to { transform: rotate(360deg); }
    }
    .sopai-spinner {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2.5px solid rgba(0, 0, 0, 0.08);
        border-top-color: #3a3a3a;
        animation: sopai-spin 0.8s linear infinite;
    }
    #sopai-widget-toggle {
        transition: box-shadow 0.3s ease, transform 0.15s ease;
    }
    #sopai-widget-toggle:hover {
        box-shadow: 0 0 20px ${glowColor}, 0 0 40px rgba(0, 194, 255, 0.25);
        transform: scale(1.07);
    }
    #sopai-widget-toggle:active {
        transform: scale(0.96);
    }
    .sopai-bubble-open {
        animation: sopai-bubble-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .sopai-bubble-closed {
        animation: sopai-bubble-out 0.22s cubic-bezier(0.4, 0, 1, 1) forwards;
        pointer-events: none;
    }
    #sopai-close-btn {
        transition: background 0.15s ease, transform 0.15s ease;
    }
    #sopai-close-btn:hover {
        background: rgba(0, 0, 0, 0.08);
        transform: scale(1.1);
    }
    #sopai-close-btn:active {
        transform: scale(0.92);
    }
`;

export const TeammateWidget: FC<BlockProps> = ({ appBridge }) => {
    const [blockSettings] = useBlockSettings<Settings>(appBridge);
    const { isFrontifyAuthenticated, user, loading } = useAuth(appBridge);
    const color = blockSettings?.color;
    const hmacKey = blockSettings?.hmacKey?.trim() ?? '';
    const buttonColor = color ? `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha ?? 1})` : '#3a3a3a';
    const glowColor = color ? `rgba(${color.red}, ${color.green}, ${color.blue}, 0.5)` : 'rgba(6, 78, 193, 0.5)';

    const [orgSlug, setOrgSlug] = useState<string | null>(() => {
        try {
            return localStorage.getItem(ORG_SLUG_KEY);
        } catch {
            return null;
        }
    });

    // null = not yet determined, true = render, false = blocked
    const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        if (!user) {
            setAccessAllowed(null);
            return;
        }

        const key = `${ACCESS_KEY_PREFIX}${user.id}`;
        let cached = false;
        try {
            cached = localStorage.getItem(key) === '1';
        } catch {
            // ignore storage errors
        }
        if (cached) {
            console.log('[SOPAI:Block] widget access cached for user', user.id);
            setAccessAllowed(true);
            return;
        }

        let cancelled = false;
        console.log('[SOPAI:Block] checking widget access for', user.email);
        checkWidgetAccess(window.location.origin, user.email)
            .then((allowed) => {
                if (cancelled) {
                    return;
                }
                if (allowed) {
                    try {
                        localStorage.setItem(key, '1');
                    } catch {
                        // ignore
                    }
                }
                setAccessAllowed(allowed);
            })
            .catch((error) => {
                console.error('[SOPAI:Block] widget access check failed:', error);
                if (!cancelled) {
                    setAccessAllowed(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [user]);

    const [open, setOpen] = useState<boolean>(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    });

    // track whether the bubble has rendered at least once so the close animation doesn't play on mount
    const hasRendered = useRef(false);
    useEffect(() => {
        if (accessAllowed === true) {
            hasRendered.current = true;
        }
    }, [accessAllowed]);

    const toggleRef = useRef<HTMLButtonElement | null>(null);
    const bubbleRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
        } catch {
            // ignore storage errors (e.g. Safari private mode)
        }
    }, [open]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape' && open) {
                setOpen(false);
                toggleRef.current?.focus();
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    useEffect(() => {
        const el = bubbleRef.current;
        if (!el) {
            return;
        }
        if (open) {
            el.removeAttribute('inert');
        } else {
            el.setAttribute('inert', '');
        }
    }, [open]);

    useEffect(() => {
        if (open) {
            const firstFocusable =
                bubbleRef.current?.querySelector<HTMLElement>(
                    'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
                ) ?? null;
            if (firstFocusable) {
                firstFocusable.focus();
            }
        }
    }, [open]);

    const containerStyle: CSSProperties = {
        position: 'fixed',
        left: 80,
        bottom: 20,
    };

    const bubbleStyle: CSSProperties = {
        position: 'absolute',
        left: 0,
        bottom: 68,
        width: 450,
        maxWidth: 'calc(100vw - 100px)',
        height: 550,
        background: '#ffffff',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
    };

    const headerStyle: CSSProperties = {
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 0 16px',
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        background: '#fafafa',
        borderRadius: '16px 16px 0 0',
        flexShrink: 0,
    };

    const closeButtonStyle: CSSProperties = {
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: 'none',
        background: 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: '#64748b',
    };

    const toggleStyle: CSSProperties = {
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: 'none',
        background: buttonColor,
        color: '#ffffff',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        position: 'relative',
        zIndex: 2147483647,
    };

    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const iframeUrl = orgSlug ? `${env.iframeOrigin}/${orgSlug}/frontify` : null;

    // If we don't have the org slug, force authenticate to get it
    useEffect(() => {
        if (!isFrontifyAuthenticated || !user || orgSlug || accessAllowed !== true) {
            return;
        }
        if (!hmacKey) {
            console.warn('[SOPAI:Block] No HMAC key configured in block settings — skipping auth.');
            return;
        }

        console.log('[SOPAI:Block] No org slug cached — forcing HMAC auth to resolve it...');
        authenticate(appBridge, { id: user.id, email: user.email }, hmacKey)
            .then((session) => {
                console.log('[SOPAI:Block] Auth succeeded, org slug:', session.org_slug);
                setOrgSlug(session.org_slug);
                try {
                    localStorage.setItem(ORG_SLUG_KEY, session.org_slug);
                } catch {
                    // ignore
                }
            })
            .catch((error) => console.error('[SOPAI:Block] Auth for org slug failed:', error));
    }, [isFrontifyAuthenticated, user, orgSlug, appBridge, accessAllowed, hmacKey]);

    // Handle postMessage from iframe — authenticate only when requested
    const handleIframeMessage = useCallback(
        async (e: MessageEvent) => {
            if (e.origin !== env.iframeOrigin) {
                return;
            }
            const data = e.data as { type?: string; url?: string; authRequired?: boolean } | null;
            console.log('[SOPAI:iframe→parent] message:', data);

            if (data?.type === 'frontify-navigate' && typeof data.url === 'string') {
                const navUrl = data.url;
                console.log('[SOPAI:Block] navigate request:', navUrl);
                try {
                    (window.top ?? window).location.href = navUrl;
                } catch (error) {
                    console.error('[SOPAI:Block] top-frame navigation blocked, opening in same tab:', error);
                    window.open(navUrl, '_top');
                }
                return;
            }

            if (data?.type !== 'frontify-ready') {
                return;
            }
            console.log('[SOPAI:Block] iframe ready, authRequired:', data.authRequired);

            if (data.authRequired && user) {
                if (!hmacKey) {
                    console.warn('[SOPAI:Block] iframe requested auth but no HMAC key is configured.');
                    return;
                }
                console.log('[SOPAI:Block] Auth required — starting HMAC auth flow...');
                try {
                    const session = await authenticate(appBridge, { id: user.id, email: user.email }, hmacKey);
                    console.log('[SOPAI:Block] HMAC auth succeeded, sending JWT to iframe');
                    iframeRef.current?.contentWindow?.postMessage(
                        { type: 'frontify-auth', token: session.access_token },
                        env.iframeOrigin,
                    );
                    // Also update org slug in case it changed
                    if (session.org_slug !== orgSlug) {
                        setOrgSlug(session.org_slug);
                        try {
                            localStorage.setItem(ORG_SLUG_KEY, session.org_slug);
                        } catch {
                            // ignore
                        }
                    }
                } catch (error) {
                    console.error('[SOPAI:Block] HMAC auth failed:', error);
                }
            } else {
                console.log('[SOPAI:Block] No auth needed, iframe has valid JWT');
            }
        },
        [appBridge, user, orgSlug, hmacKey],
    );

    useEffect(() => {
        function logAllMessages(e: MessageEvent) {
            if (e.origin === env.iframeOrigin) {
                console.log('[SOPAI:iframe→parent] raw:', e.data);
            }
        }
        const onMessage = (e: MessageEvent) => {
            handleIframeMessage(e).catch((error) => {
                console.error('[SOPAI:Block] message handler failed:', error);
            });
        };
        window.addEventListener('message', logAllMessages);
        window.addEventListener('message', onMessage);
        return () => {
            window.removeEventListener('message', logAllMessages);
            window.removeEventListener('message', onMessage);
        };
    }, [handleIframeMessage]);

    console.log('[SOPAI:Block] Render state:', {
        loading,
        isFrontifyAuthenticated,
        orgSlug,
        iframeUrl,
        user: user?.email ?? null,
    });

    const bubbleAnimClass = open ? 'sopai-bubble-open' : hasRendered.current ? 'sopai-bubble-closed' : '';

    if (accessAllowed !== true) {
        return null;
    }

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: getWidgetStyles(glowColor) }} />
            <div id="sopai-widget-root" className="sopai-teammate-widget" style={containerStyle} aria-hidden={!open}>
                <div
                    id="sopai-widget-bubble"
                    role="dialog"
                    aria-label="Sopai teammate"
                    ref={bubbleRef}
                    style={bubbleStyle}
                    className={bubbleAnimClass}
                >
                    <div style={headerStyle}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a', letterSpacing: '-0.01em' }}>
                            TeamMate
                        </span>
                        <button
                            id="sopai-close-btn"
                            aria-label="Close widget"
                            style={closeButtonStyle}
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                toggleRef.current?.focus();
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                <path
                                    d="M1.5 1.5L12.5 12.5M1.5 12.5L12.5 1.5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </button>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {loading ? (
                            <div
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 16,
                                    padding: 24,
                                    textAlign: 'center',
                                }}
                            >
                                <div className="sopai-spinner" aria-hidden="true" />
                                <div style={{ color: '#475569', fontSize: 14, lineHeight: 1.5, maxWidth: 280 }}>
                                    <div style={{ fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
                                        Preparing your account
                                    </div>
                                    <div style={{ color: '#64748b' }}>
                                        We&apos;re validating your access — this may take a moment.
                                    </div>
                                </div>
                            </div>
                        ) : isFrontifyAuthenticated && !hmacKey ? (
                            <div
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 12,
                                    padding: 24,
                                    textAlign: 'center',
                                }}
                            >
                                <div
                                    aria-hidden="true"
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '50%',
                                        background: '#fef3c7',
                                        color: '#b45309',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 700,
                                        fontSize: 18,
                                    }}
                                >
                                    !
                                </div>
                                <div style={{ color: '#475569', fontSize: 14, lineHeight: 1.5, maxWidth: 280 }}>
                                    <div style={{ fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
                                        HMAC key missing
                                    </div>
                                    <div style={{ color: '#64748b' }}>Please contact your administrator.</div>
                                </div>
                            </div>
                        ) : isFrontifyAuthenticated && iframeUrl ? (
                            <iframe
                                ref={iframeRef}
                                src={iframeUrl}
                                style={{
                                    flex: 1,
                                    width: '100%',
                                    border: 'none',
                                }}
                                title="TeamMate Chat"
                            />
                        ) : (
                            <p style={{ padding: 16, color: '#94a3b8', fontSize: 14 }}>Not authenticated</p>
                        )}
                    </div>
                </div>

                <button
                    id="sopai-widget-toggle"
                    ref={toggleRef}
                    aria-controls="sopai-widget-bubble"
                    aria-expanded={open}
                    title={open ? 'Close TeamMate' : 'Open TeamMate'}
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpen((v) => !v);
                    }}
                    style={toggleStyle}
                >
                    <svg
                        width="30"
                        height="30"
                        viewBox="0 0 38 38"
                        fill="none"
                        aria-hidden="true"
                        style={{ pointerEvents: 'none' }}
                    >
                        <g transform="matrix(0.75325565,0,0,0.75325565,5.4413978,4.6881426)">
                            <path d={LOGO_PATH} fill="#ffffff" />
                        </g>
                    </svg>
                </button>
            </div>
        </>
    );
};
