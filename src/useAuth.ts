import type { AppBridgeBlock } from '@frontify/app-bridge';
import { useEffect, useState } from 'react';

type AuthUser = {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
};

type FrontifyState = {
    isFrontifyAuthenticated: boolean;
    user: AuthUser | null;
    loading: boolean;
};

export function useAuth(appBridge: AppBridgeBlock): FrontifyState {
    const [state, setState] = useState<FrontifyState>({
        isFrontifyAuthenticated: false,
        user: null,
        loading: true,
    });

    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                console.log('[SOPAI:useAuth] Checking Frontify isAuthenticated...');
                const isAuthenticated = appBridge.context('isAuthenticated').get();
                console.log('[SOPAI:useAuth] isAuthenticated:', isAuthenticated);

                if (!isAuthenticated) {
                    console.log('[SOPAI:useAuth] Not authenticated, bailing');
                    if (!cancelled) {
                        setState({ isFrontifyAuthenticated: false, user: null, loading: false });
                    }
                    return;
                }

                console.log('[SOPAI:useAuth] Fetching getCurrentUser...');
                const response = await appBridge.api({ name: 'getCurrentUser' });
                console.log('[SOPAI:useAuth] getCurrentUser response:', response);
                if (!cancelled) {
                    setState({
                        isFrontifyAuthenticated: true,
                        user: {
                            id: response.id,
                            name: response.name ?? null,
                            email: response.email,
                            avatar: response.avatar ?? null,
                        },
                        loading: false,
                    });
                    console.log('[SOPAI:useAuth] State set, user ready');
                }
            } catch (err) {
                console.error('[SOPAI:useAuth] Error:', err);
                if (!cancelled) {
                    setState({ isFrontifyAuthenticated: false, user: null, loading: false });
                }
            }
        }

        init();

        return () => {
            cancelled = true;
        };
    }, [appBridge]);

    return state;
}
