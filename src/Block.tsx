import { type Color, useBlockSettings } from '@frontify/app-bridge';
import { type BlockProps } from '@frontify/guideline-blocks-settings';
import { type CSSProperties, type FC, useEffect, useRef, useState } from 'react';

type Settings = {
    color: Color;
};

const STORAGE_KEY = 'sopai_frontify_widget_open_v1';

const toCssRgbaString = (color?: Color): string => {
    if (!color) return 'rgba(6, 78, 193, 1)'; // fallback
    return `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha})`;
};

export const TeammateWidget: FC<BlockProps> = ({ appBridge }) => {
    const [blockSettings] = useBlockSettings<Settings>(appBridge);
    const buttonColor = toCssRgbaString(blockSettings?.color);

    const [open, setOpen] = useState<boolean>(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    });

    const rootRef = useRef<HTMLDivElement | null>(null);
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
        if (!rootRef.current || !toggleRef.current) return;
        rootRef.current.style.pointerEvents = open ? 'auto' : 'none';
        toggleRef.current.style.pointerEvents = 'auto';
    }, [open]);

    useEffect(() => {
        if (open) {
            const firstFocusable =
                bubbleRef.current?.querySelector<HTMLElement>(
                    'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
                ) ?? null;
            if (firstFocusable) firstFocusable.focus();
        }
    }, [open]);

    const containerStyle: CSSProperties = {
        position: 'fixed',
        left: 80,
        bottom: 20,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 12,
    };

    const bubbleStyle: CSSProperties = {
        width: 340,
        maxWidth: 'calc(100vw - 48px)',
        height: 420,
        background: '#ffffff',
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(11,22,40,0.25)',
        overflow: 'hidden',
        transform: open ? 'translateY(0) scale(1)' : 'translateY(12px) scale(.98)',
        opacity: open ? 1 : 0,
        transition: 'transform .22s cubic-bezier(.22,.9,.31,1), opacity .18s',
        pointerEvents: open ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
    };

    const toggleStyle: CSSProperties = {
        width: 56,
        height: 56,
        borderRadius: '9999px',
        border: 'none',
        background: `linear-gradient(135deg, ${buttonColor}, #00c2ff)`,
        color: '#fff',
        boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    };

    return (
        <div
            id="sopai-widget-root"
            ref={rootRef}
            className="sopai-teammate-widget"
            style={containerStyle}
            aria-hidden={!open}
        >
            <div id="sopai-widget-bubble" role="dialog" aria-label="Sopai teammate" ref={bubbleRef} style={bubbleStyle}>
                <div
                    className="flex items-center justify-between px-3"
                    style={{
                        height: 56,
                        borderBottom: '1px solid #eee',
                        background: 'linear-gradient(180deg,#fafafa,#fff)',
                    }}
                >
                    <div className="font-semibold text-sm text-slate-900">Sopai Teammate</div>
                    <div className="flex items-center gap-1">
                        <button
                            aria-label="Minimize widget"
                            className="text-slate-600 hover:text-slate-800 px-2 py-1 rounded"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                toggleRef.current?.focus();
                            }}
                        >
                            −
                        </button>
                        <button
                            aria-label="Close widget"
                            className="text-slate-600 hover:text-slate-800 px-2 py-1 rounded"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                try {
                                    localStorage.removeItem(STORAGE_KEY);
                                } catch {
                                    // ignore
                                }
                                toggleRef.current?.focus();
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="p-3 text-sm text-slate-800 overflow-auto" style={{ flex: 1 }}>
                    <p className="mb-2">Teammate widget content goes here.</p>
                </div>
            </div>

            <button
                id="sopai-widget-toggle"
                ref={toggleRef}
                aria-controls="sopai-widget-bubble"
                aria-expanded={open}
                title={open ? 'Close Sopai teammate' : 'Open Sopai teammate'}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                style={toggleStyle}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="pointer-events-none"
                >
                    {open ? (
                        <path
                            d="M6 6L18 18M6 18L18 6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ) : (
                        <path
                            d="M12 5v14M5 12h14"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}
                </svg>
            </button>
        </div>
    );
};
