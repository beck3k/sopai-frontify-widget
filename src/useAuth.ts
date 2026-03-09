import type { AppBridgeBlock } from '@frontify/app-bridge';
import { useEffect, useState } from 'react';

type AuthUser = {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
};

type AuthState = {
    isAuthenticated: boolean;
    user: AuthUser | null;
    loading: boolean;
};

export function useAuth(appBridge: AppBridgeBlock): AuthState {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        user: null,
        loading: true,
    });

    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const isAuthenticated = appBridge.context('isAuthenticated').get();

                if (!isAuthenticated) {
                    if (!cancelled) {
                        setState({ isAuthenticated: false, user: null, loading: false });
                    }
                    return;
                }

                const response = await appBridge.api({ name: 'getCurrentUser' });
                console.log('APP BRIDGE RESPONE', response);
                if (!cancelled) {
                    setState({
                        isAuthenticated: true,
                        user: {
                            id: response.id,
                            name: response.name ?? null,
                            email: response.email,
                            avatar: response.avatar ?? null,
                        },
                        loading: false,
                    });
                }
            } catch {
                if (!cancelled) {
                    setState({ isAuthenticated: false, user: null, loading: false });
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
